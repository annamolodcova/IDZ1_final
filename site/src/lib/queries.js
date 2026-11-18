import { DEFAULT_STATUS } from './statuses.js';

// sql.js не умеет биндить undefined — приводим отсутствующие значения к null.
function sqlValue(value) {
  return value === undefined ? null : value;
}

function rowToVacancy(row) {
  return {
    id: row.id,
    userId: row.user_id,
    company: row.company,
    position: row.position,
    status: row.status,
    testDeadline: row.test_deadline,
    nextInterviewAt: row.next_interview_at,
    link: row.link,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const VACANCY_COLUMNS =
  'id, user_id, company, position, status, test_deadline, next_interview_at, link, notes, created_at, updated_at';

/* ------------------------------- Пользователи ------------------------------ */

export function insertUser(db, user) {
  db.run(
    `INSERT INTO users (id, name, email, password_hash, password_salt, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      user.id,
      user.name,
      user.email,
      user.passwordHash,
      user.passwordSalt,
      user.createdAt ?? new Date().toISOString(),
    ],
  );
  return getUserById(db, user.id);
}

export function getUserByEmail(db, email) {
  const stmt = db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE');
  stmt.bind([String(email ?? '').trim()]);
  const user = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return user
    ? {
        id: user.id,
        name: user.name,
        email: user.email,
        passwordHash: user.password_hash,
        passwordSalt: user.password_salt,
        createdAt: user.created_at,
      }
    : null;
}

export function getUserById(db, id) {
  if (!id) return null;
  const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
  stmt.bind([id]);
  const user = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return user
    ? {
        id: user.id,
        name: user.name,
        email: user.email,
        passwordHash: user.password_hash,
        passwordSalt: user.password_salt,
        createdAt: user.created_at,
      }
    : null;
}

export function renameUser(db, id, name) {
  db.run('UPDATE users SET name = ? WHERE id = ?', [name, id]);
  return getUserById(db, id);
}

/* -------------------------------- Вакансии -------------------------------- */

/** Все вакансии пользователя, свежие изменения — первыми. */
export function getAllVacancies(db, userId) {
  const stmt = db.prepare(
    `SELECT ${VACANCY_COLUMNS} FROM vacancies WHERE user_id = ? ORDER BY updated_at DESC`,
  );
  stmt.bind([userId]);
  const rows = [];
  while (stmt.step()) rows.push(rowToVacancy(stmt.getAsObject()));
  stmt.free();
  return rows;
}

export function getVacancyById(db, userId, id) {
  const stmt = db.prepare(`SELECT ${VACANCY_COLUMNS} FROM vacancies WHERE id = ? AND user_id = ?`);
  stmt.bind([id, userId]);
  const row = stmt.step() ? rowToVacancy(stmt.getAsObject()) : null;
  stmt.free();
  return row;
}

export function insertVacancy(db, userId, vacancy) {
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO vacancies (id, user_id, company, position, status, test_deadline,
       next_interview_at, link, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      sqlValue(vacancy.id),
      userId,
      sqlValue(vacancy.company),
      sqlValue(vacancy.position),
      vacancy.status || DEFAULT_STATUS,
      sqlValue(vacancy.testDeadline),
      sqlValue(vacancy.nextInterviewAt),
      sqlValue(vacancy.link),
      vacancy.notes || '',
      vacancy.createdAt || now,
      vacancy.updatedAt || now,
    ],
  );
  return getVacancyById(db, userId, vacancy.id);
}

export function updateVacancy(db, userId, id, updates) {
  const fields = [];
  const values = [];

  const allowed = {
    company: 'company',
    position: 'position',
    status: 'status',
    testDeadline: 'test_deadline',
    nextInterviewAt: 'next_interview_at',
    link: 'link',
    notes: 'notes',
  };

  for (const [key, column] of Object.entries(allowed)) {
    if (key in updates) {
      fields.push(`${column} = ?`);
      values.push(sqlValue(updates[key]));
    }
  }

  if (fields.length === 0) return false;

  fields.push('updated_at = ?');
  values.push(new Date().toISOString(), id, userId);

  db.run(`UPDATE vacancies SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`, values);
  return db.getRowsModified() > 0;
}

export function deleteVacancy(db, userId, id) {
  db.run('DELETE FROM vacancies WHERE id = ? AND user_id = ?', [id, userId]);
  return db.getRowsModified() > 0;
}

/**
 * Счётчики по статусам для текущего пользователя.
 * Фильтрация и поиск выполняются в JS: SQLite LOWER() не знает кириллицу,
 * а «ё» и регистр должны нормализоваться одинаково во всех местах.
 */
export function getStatusCounts(db, userId) {
  const stmt = db.prepare(
    'SELECT status, COUNT(*) AS count FROM vacancies WHERE user_id = ? GROUP BY status',
  );
  stmt.bind([userId]);
  const counts = {};
  while (stmt.step()) {
    const row = stmt.getAsObject();
    counts[row.status] = row.count;
  }
  stmt.free();
  return counts;
}

export function getOverdueCount(db, userId) {
  const today = new Date().toISOString().slice(0, 10);
  const stmt = db.prepare(
    `SELECT COUNT(*) AS count FROM vacancies
     WHERE user_id = ? AND test_deadline IS NOT NULL AND test_deadline < ?`,
  );
  stmt.bind([userId, today]);
  const count = stmt.step() ? stmt.getAsObject().count : 0;
  stmt.free();
  return count;
}

export function bulkInsertVacancies(db, userId, vacancies) {
  const stmt = db.prepare(
    `INSERT INTO vacancies (id, user_id, company, position, status, test_deadline,
       next_interview_at, link, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const now = new Date().toISOString();

  db.exec('BEGIN TRANSACTION');
  try {
    for (const vacancy of vacancies) {
      stmt.run([
        sqlValue(vacancy.id),
        userId,
        sqlValue(vacancy.company),
        sqlValue(vacancy.position),
        vacancy.status || DEFAULT_STATUS,
        sqlValue(vacancy.testDeadline),
        sqlValue(vacancy.nextInterviewAt),
        sqlValue(vacancy.link),
        vacancy.notes || '',
        vacancy.createdAt || now,
        vacancy.updatedAt || now,
      ]);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  } finally {
    stmt.free();
  }
}

export function clearAllVacancies(db, userId) {
  db.run('DELETE FROM vacancies WHERE user_id = ?', [userId]);
}
