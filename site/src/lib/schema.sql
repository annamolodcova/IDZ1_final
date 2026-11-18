-- Career Diary SQLite Schema
-- Version 2: пользователи + вакансии, привязанные к пользователю

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vacancies (
  id                TEXT PRIMARY KEY,
  user_id           TEXT REFERENCES users(id) ON DELETE CASCADE,
  company           TEXT NOT NULL,
  position          TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'applied',
  test_deadline     TEXT,
  next_interview_at TEXT,
  link              TEXT,
  notes             TEXT DEFAULT '',
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vacancies_user ON vacancies(user_id);
CREATE INDEX IF NOT EXISTS idx_vacancies_status ON vacancies(status);
CREATE INDEX IF NOT EXISTS idx_vacancies_test_deadline ON vacancies(test_deadline);
CREATE INDEX IF NOT EXISTS idx_vacancies_next_interview ON vacancies(next_interview_at);
CREATE INDEX IF NOT EXISTS idx_vacancies_updated_at ON vacancies(updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email COLLATE NOCASE);

-- Заготовки следующих версий:
-- CREATE TABLE IF NOT EXISTS tags (
--   id INTEGER PRIMARY KEY AUTOINCREMENT,
--   name TEXT UNIQUE NOT NULL,
--   color TEXT NOT NULL
-- );
-- CREATE TABLE IF NOT EXISTS vacancy_tags (
--   vacancy_id TEXT NOT NULL,
--   tag_id INTEGER NOT NULL,
--   PRIMARY KEY (vacancy_id, tag_id),
--   FOREIGN KEY (vacancy_id) REFERENCES vacancies(id) ON DELETE CASCADE,
--   FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
-- );
-- CREATE TABLE IF NOT EXISTS stage_history (
--   id INTEGER PRIMARY KEY AUTOINCREMENT,
--   vacancy_id TEXT NOT NULL,
--   from_status TEXT,
--   to_status TEXT NOT NULL,
--   changed_at TEXT NOT NULL,
--   FOREIGN KEY (vacancy_id) REFERENCES vacancies(id) ON DELETE CASCADE
-- );
-- CREATE TABLE IF NOT EXISTS attachments (
--   id INTEGER PRIMARY KEY AUTOINCREMENT,
--   vacancy_id TEXT NOT NULL,
--   name TEXT NOT NULL,
--   type TEXT NOT NULL,
--   data BLOB NOT NULL,
--   uploaded_at TEXT NOT NULL,
--   FOREIGN KEY (vacancy_id) REFERENCES vacancies(id) ON DELETE CASCADE
-- );