/**
 * SQLite в браузере (sql.js) с постоянным хранением.
 *
 * Порядок выбора хранилища:
 *   1. OPFS (Origin Private File System) — самый надёжный и быстрый вариант;
 *   2. IndexedDB — фоллбек, если OPFS недоступен;
 *   3. память — приложение работает, но предупреждает, что данные не сохраняются.
 *
 * К каждому асинхронному вызову хранилища добавлен таймаут: некоторые браузеры
 * (и headless-окружения) могут «подвешивать» Storage API, и приложение не должно
 * из-за этого застревать на экране загрузки.
 */

import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import schemaSql from './schema.sql?raw';
import { createSalt, hashPassword } from './password.js';

const DB_NAME = 'career-diary.sqlite';
const IDB_NAME = 'CareerDiaryDB';
const IDB_STORE = 'sqlite';
const CURRENT_DB_VERSION = 2;
const LEGACY_USER_EMAIL = 'anna@example.com';
const LEGACY_USER_PASSWORD = 'demo1234';

// Щедрые таймауты: холодный старт Storage API иногда занимает секунды.
// Зависший вызов не должен оставлять приложение на экране загрузки.
const OPFS_TIMEOUT_MS = 8000;
const IDB_TIMEOUT_MS = 8000;

let dbInstance = null;
let initPromise = null;
let storageWarning = null;

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}: timeout ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, 1);

    request.onupgradeneeded = (event) => {
      const idb = event.target.result;
      if (!idb.objectStoreNames.contains(IDB_STORE)) idb.createObjectStore(IDB_STORE);
    };
    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('IndexedDB blocked'));
  });
}

async function readFromIndexedDB() {
  const idb = await withTimeout(openIndexedDB(), IDB_TIMEOUT_MS, 'indexedDB.open');
  try {
    return await withTimeout(
      new Promise((resolve, reject) => {
        const tx = idb.transaction(IDB_STORE, 'readonly');
        const request = tx.objectStore(IDB_STORE).get(DB_NAME);
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => reject(request.error);
      }),
      IDB_TIMEOUT_MS,
      'indexedDB.get',
    );
  } finally {
    idb.close();
  }
}

async function writeToIndexedDB(bytes) {
  const idb = await withTimeout(openIndexedDB(), IDB_TIMEOUT_MS, 'indexedDB.open');
  try {
    await withTimeout(
      new Promise((resolve, reject) => {
        const tx = idb.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(bytes, DB_NAME);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error('indexedDB write aborted'));
      }),
      IDB_TIMEOUT_MS,
      'indexedDB.put',
    );
  } finally {
    idb.close();
  }
}

/**
 * Читает файл БД из OPFS. Возвращает null, если файла ещё нет.
 */
async function readFromOPFS() {
  if (!('storage' in navigator) || typeof navigator.storage.getDirectory !== 'function') {
    return null;
  }

  const root = await withTimeout(navigator.storage.getDirectory(), OPFS_TIMEOUT_MS, 'opfs.getDirectory');
  const fileHandle = await withTimeout(
    root.getFileHandle(DB_NAME, { create: false }),
    OPFS_TIMEOUT_MS,
    'opfs.getFileHandle',
  );
  const file = await withTimeout(fileHandle.getFile(), OPFS_TIMEOUT_MS, 'opfs.getFile');
  const buffer = await withTimeout(file.arrayBuffer(), OPFS_TIMEOUT_MS, 'opfs.arrayBuffer');
  return new Uint8Array(buffer);
}

/**
 * Пишет файл БД в OPFS.
 */
async function writeToOPFS(bytes) {
  if (!('storage' in navigator) || typeof navigator.storage.getDirectory !== 'function') {
    throw new Error('OPFS недоступен');
  }

  const root = await withTimeout(navigator.storage.getDirectory(), OPFS_TIMEOUT_MS, 'opfs.getDirectory');
  const fileHandle = await withTimeout(
    root.getFileHandle(DB_NAME, { create: true }),
    OPFS_TIMEOUT_MS,
    'opfs.getFileHandle',
  );
  const writable = await withTimeout(
    fileHandle.createWritable(),
    OPFS_TIMEOUT_MS,
    'opfs.createWritable',
  );
  await withTimeout(writable.write(bytes), OPFS_TIMEOUT_MS, 'opfs.write');
  await withTimeout(writable.close(), OPFS_TIMEOUT_MS, 'opfs.close');

  // Просим браузер не вытеснять данные при нехватке места.
  if (typeof navigator.storage.persist === 'function') {
    try {
      await withTimeout(navigator.storage.persist(), 1000, 'opfs.persist');
    } catch {
      // Ничего страшного: данные всё равно записаны.
    }
  }
}

function applySchema(db) {
  db.exec(schemaSql);
  db.exec(`PRAGMA user_version = ${CURRENT_DB_VERSION};`);
}

function readSchemaVersion(db) {
  const result = db.exec('PRAGMA user_version;');
  return result?.[0]?.values?.[0]?.[0] ?? 0;
}

function hasColumn(db, table, column) {
  const result = db.exec(`PRAGMA table_info(${table});`);
  const rows = result?.[0]?.values ?? [];
  return rows.some((row) => row[1] === column);
}

/**
 * Приводит базу к актуальной версии схемы.
 * Версия 1 → 2: появляются пользователи, у вакансий — владелец.
 * Старые записи без владельца закрепляются за демо-профилем,
 * чтобы данные не потерялись.
 */
async function migrateDatabase(db) {
  const version = readSchemaVersion(db);

  if (version === 0) {
    applySchema(db);
    return;
  }

  if (version >= CURRENT_DB_VERSION) return;

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      created_at    TEXT NOT NULL
    );
  `);

  if (!hasColumn(db, 'vacancies', 'user_id')) {
    db.exec('ALTER TABLE vacancies ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE');
  }

  db.exec('CREATE INDEX IF NOT EXISTS idx_vacancies_user ON vacancies(user_id)');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email COLLATE NOCASE)');

  const orphanCount =
    db.exec('SELECT COUNT(*) FROM vacancies WHERE user_id IS NULL;')?.[0]?.values?.[0]?.[0] ?? 0;

  if (orphanCount > 0) {
    const existing = db.exec(
      `SELECT id FROM users WHERE email = '${LEGACY_USER_EMAIL}' COLLATE NOCASE;`,
    );
    let userId = existing?.[0]?.values?.[0]?.[0];

    if (!userId) {
      userId = crypto.randomUUID();
      const salt = createSalt();
      const hash = await hashPassword(LEGACY_USER_PASSWORD, salt);
      db.run(
        'INSERT INTO users (id, name, email, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, 'Анна', LEGACY_USER_EMAIL, hash, salt, new Date().toISOString()],
      );
    }

    db.run('UPDATE vacancies SET user_id = ? WHERE user_id IS NULL', [userId]);
  }

  db.exec(`PRAGMA user_version = ${CURRENT_DB_VERSION};`);
  await saveDatabase(db);
}

/**
 * Инициализация базы. Идемпотентна: повторные вызовы получают тот же инстанс.
 */
export async function initDatabase() {
  if (dbInstance) return dbInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const SQL = await initSqlJs({ locateFile: () => wasmUrl });

    let bytes = null;
    let source = null;
    // Отличаем «данных ещё нет» (нормальный первый запуск) от «хранилище недоступно».
    let storageAvailable = false;

    // 1. OPFS
    try {
      bytes = await readFromOPFS();
      storageAvailable = true;
      if (bytes) source = 'opfs';
    } catch (error) {
      console.warn('OPFS недоступен, пробуем IndexedDB:', error.message);
    }

    // 2. IndexedDB — и как фоллбек, и как второй источник сохранённых данных.
    if (!bytes) {
      try {
        bytes = await readFromIndexedDB();
        storageAvailable = true;
        if (bytes) source = 'indexeddb';
      } catch (error) {
        console.warn('IndexedDB недоступен:', error.message);
      }
    }

    let db;
    if (bytes) {
      try {
        db = new SQL.Database(bytes);
        // Файл мог быть создан другой версией схемы.
        await migrateDatabase(db);
      } catch (error) {
        console.warn('Не удалось открыть сохранённую базу, создаём новую:', error.message);
        db = new SQL.Database();
        applySchema(db);
        source = null;
      }
    } else {
      db = new SQL.Database();
      applySchema(db);
    }

    if (!storageAvailable) {
      storageWarning =
        'Постоянное хранилище браузера недоступно: данные не сохранятся после перезагрузки.';
    }

    dbInstance = db;
    return db;
  })().catch((error) => {
    // Сбрасываем промис, чтобы можно было попробовать снова.
    initPromise = null;
    throw error;
  });

  return initPromise;
}

export function getStorageWarning() {
  return storageWarning;
}

export function getDatabase() {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return dbInstance;
}

/**
 * Сохраняет базу в постоянное хранилище.
 * @returns {Promise<{ ok: boolean, warning?: string }>}
 */
export async function saveDatabase(db = dbInstance) {
  if (!db) return { ok: false, warning: 'База данных не инициализирована.' };

  const bytes = db.export();

  try {
    await writeToOPFS(bytes);
    return { ok: true };
  } catch (opfsError) {
    try {
      await writeToIndexedDB(bytes);
      return { ok: true };
    } catch (idbError) {
      console.warn('Не удалось сохранить базу:', opfsError.message, idbError.message);
      return {
        ok: false,
        warning: 'Данные не сохраняются: хранилище браузера недоступно или переполнено.',
      };
    }
  }
}
