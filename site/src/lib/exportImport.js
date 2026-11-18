// Экспорт и импорт списка вакансий в JSON — перенос данных между браузерами
// и резервная копия без доступа к базе.

import { normalizeVacancy } from './storage.js';

export const EXPORT_VERSION = 1;

export function buildExportPayload(vacancies, user) {
  return {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    app: 'career-diary',
    profile: user ? { name: user.name, email: user.email } : null,
    vacancies: vacancies.map((vacancy) => ({
      id: vacancy.id,
      company: vacancy.company,
      position: vacancy.position,
      status: vacancy.status,
      testDeadline: vacancy.testDeadline ?? null,
      nextInterviewAt: vacancy.nextInterviewAt ?? null,
      link: vacancy.link ?? null,
      notes: vacancy.notes ?? '',
      createdAt: vacancy.createdAt,
      updatedAt: vacancy.updatedAt,
    })),
  };
}

export function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function buildExportFilename(today) {
  return `career-diary-${today}.json`;
}

/**
 * Разбирает и нормализует файл импорта.
 * @returns {{ ok: true, vacancies: Array } | { ok: false, error: string }}
 */
export function parseImportFile(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Файл не является корректным JSON.' };
  }

  const list = Array.isArray(parsed) ? parsed : parsed?.vacancies;
  if (!Array.isArray(list)) {
    return { ok: false, error: 'В файле нет массива vacancies.' };
  }

  const vacancies = list.map(normalizeVacancy).filter(Boolean);
  if (vacancies.length === 0) {
    return { ok: false, error: 'В файле нет валидных вакансий (нужны компания и должность).' };
  }

  return { ok: true, vacancies };
}