import initSqlJs from '../site/node_modules/sql.js/dist/sql-wasm.js';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const siteDir = path.resolve(rootDir, 'site');
const schemaPath = path.resolve(siteDir, 'src/lib/schema.sql');

async function sha256(value) {
  return crypto.createHash('sha256').update(value).digest();
}

async function hashPassword(password, salt) {
  let value = `${salt}:${password}`;
  let digest = await sha256(value);
  for (let i = 1; i < 1000; i += 1) {
    digest = await sha256(`${digest.toString('hex')}:${salt}`);
  }
  return digest.toString('hex');
}

function createSalt() {
  return crypto.randomBytes(16).toString('hex');
}

(async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  db.exec(schema);

  const userId = crypto.randomUUID();
  const salt = createSalt();
  const hash = await hashPassword('demo1234', salt);
  const now = new Date().toISOString();

  db.run(
    'INSERT INTO users (id, name, email, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [userId, 'Анна', 'anna@example.com', hash, salt, now]
  );

  const today = new Date().toISOString().slice(0, 10);
  const addDays = (days) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };

  const samples = [
    {
      company: 'Яндекс',
      position: 'Стажёр-аналитик',
      status: 'test',
      test_deadline: addDays(-1),
      next_interview_at: null,
      link: 'https://yandex.ru/jobs',
      notes: 'Тестовое: SQL и A/B-анализ. Сдать до конца дня, файл прислать рекрутеру.',
    },
    {
      company: 'Сбер',
      position: 'Junior Frontend-разработчик',
      status: 'interview',
      test_deadline: null,
      next_interview_at: today,
      link: null,
      notes: 'Созвон с командой в 15:00, ссылка в письме от рекрутера.',
    },
    {
      company: 'Т-Банк',
      position: 'Стажёр-разработчик',
      status: 'screening',
      test_deadline: null,
      next_interview_at: addDays(2),
      link: null,
      notes: 'Скрининг с рекрутером, обсуждаем формат стажировки.',
    },
    {
      company: 'Ozon',
      position: 'Junior QA-инженер',
      status: 'applied',
      test_deadline: addDays(7),
      next_interview_at: null,
      link: null,
      notes: 'Отклик отправлен, ждём тестовое задание.',
    },
    {
      company: 'VK',
      position: 'Стажёр-продуктолог',
      status: 'rejected',
      test_deadline: null,
      next_interview_at: null,
      link: null,
      notes: 'Отказ после скрининга. Вернуться через полгода.',
    },
  ];

  for (const s of samples) {
    db.run(
      `INSERT INTO vacancies (id, user_id, company, position, status, test_deadline,
         next_interview_at, link, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        userId,
        s.company,
        s.position,
        s.status,
        s.test_deadline,
        s.next_interview_at,
        s.link,
        s.notes,
        now,
        now,
      ]
    );
  }

  db.exec('PRAGMA user_version = 2;');

  const data = db.export();
  const buffer = Buffer.from(data);

  fs.writeFileSync(path.resolve(siteDir, 'career-diary.sqlite'), buffer);
  fs.writeFileSync(path.resolve(rootDir, 'career-diary.sqlite'), buffer);
  console.log('career-diary.sqlite seeded and saved in root and site/! Size:', buffer.length);
})();
