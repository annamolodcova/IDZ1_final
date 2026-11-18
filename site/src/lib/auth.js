// Прототип авторизации без внешних систем.
// Пользователи и пароли (в виде соли и хеша) хранятся в локальной SQLite,
// сессия — в localStorage: после перезагрузки страницы вход сохраняется.

import { getDatabase, saveDatabase } from './db.js';
import { getUserByEmail, getUserById, insertUser, renameUser } from './queries.js';
import { createSalt, hashPassword, verifyPassword } from './password.js';

const SESSION_KEY = 'career-diary.session.v1';
export const MIN_PASSWORD_LENGTH = 6;

export const DEMO_CREDENTIALS = { email: 'anna@example.com', password: 'demo1234' };

function publicUser(row) {
  if (!row) return null;
  return { id: row.id, name: row.name, email: row.email, createdAt: row.createdAt };
}

export function readSession() {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

function writeSession(userId) {
  try {
    localStorage.setItem(SESSION_KEY, userId);
  } catch {
    // Без localStorage сессия живёт до перезагрузки — не критично для прототипа.
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}

/** Текущий пользователь из сессии; если сессия битая — сбрасывается. */
export function getCurrentUser() {
  const id = readSession();
  if (!id) return null;

  try {
    const user = getUserById(getDatabase(), id);
    if (!user) {
      clearSession();
      return null;
    }
    return publicUser(user);
  } catch {
    return null;
  }
}

export function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(String(email ?? '').trim());
}

export function validateRegistration({ name, email, password }) {
  const errors = {};
  if (String(name ?? '').trim().length < 2) errors.name = 'Укажите имя';
  if (!validateEmail(email)) errors.email = 'Укажите почту вида name@example.com';
  if (String(password ?? '').length < MIN_PASSWORD_LENGTH) {
    errors.password = `Пароль не короче ${MIN_PASSWORD_LENGTH} символов`;
  }
  return errors;
}

/**
 * @returns {Promise<{ ok: true, user: object } | { ok: false, error: string, field?: string }>}
 */
export async function register({ name, email, password }) {
  const errors = validateRegistration({ name, email, password });
  if (Object.keys(errors).length > 0) {
    const [field] = Object.keys(errors);
    return { ok: false, error: errors[field], field };
  }

  const db = getDatabase();
  const normalizedEmail = email.trim().toLowerCase();

  if (getUserByEmail(db, normalizedEmail)) {
    return { ok: false, error: 'Профиль с такой почтой уже есть', field: 'email' };
  }

  const salt = createSalt();
  const hash = await hashPassword(password, salt);
  const id = crypto.randomUUID();

  try {
    insertUser(db, {
      id,
      name: name.trim(),
      email: normalizedEmail,
      passwordHash: hash,
      passwordSalt: salt,
    });
  } catch (error) {
    return { ok: false, error: `Не удалось создать профиль: ${error.message}` };
  }

  await saveDatabase(db);
  writeSession(id);
  return { ok: true, user: publicUser(getUserById(db, id)) };
}

/**
 * @returns {Promise<{ ok: true, user: object } | { ok: false, error: string, field?: string }>}
 */
export async function login({ email, password }) {
  const db = getDatabase();
  const normalizedEmail = String(email ?? '').trim().toLowerCase();

  if (!normalizedEmail || !password) {
    return {
      ok: false,
      error: 'Введите почту и пароль',
      field: !normalizedEmail ? 'email' : 'password',
    };
  }

  const row = getUserByEmail(db, normalizedEmail);
  if (!row) {
    return { ok: false, error: 'Профиль не найден. Проверьте почту или зарегистрируйтесь.', field: 'email' };
  }

  const valid = await verifyPassword(password, row.passwordSalt, row.passwordHash);
  if (!valid) {
    return { ok: false, error: 'Неверный пароль', field: 'password' };
  }

  writeSession(row.id);
  return { ok: true, user: publicUser(row) };
}

/**
 * Вход в демо-профиль: создаёт его при первом обращении.
 * Нужен, чтобы можно было посмотреть приложение без регистрации.
 */
export async function loginDemo() {
  const db = getDatabase();
  let row = getUserByEmail(db, DEMO_CREDENTIALS.email);

  if (!row) {
    const salt = createSalt();
    const hash = await hashPassword(DEMO_CREDENTIALS.password, salt);
    insertUser(db, {
      id: crypto.randomUUID(),
      name: 'Анна',
      email: DEMO_CREDENTIALS.email,
      passwordHash: hash,
      passwordSalt: salt,
    });
    await saveDatabase(db);
    row = getUserByEmail(db, DEMO_CREDENTIALS.email);
  }

  writeSession(row.id);
  return { ok: true, user: publicUser(row) };
}

export function logout() {
  clearSession();
}

export async function updateProfileName(userId, name) {
  const trimmed = String(name ?? '').trim();
  if (trimmed.length < 2) {
    return { ok: false, error: 'Имя не короче 2 символов' };
  }
  const db = getDatabase();
  const row = renameUser(db, userId, trimmed);
  await saveDatabase(db);
  return { ok: true, user: publicUser(row) };
}