import { DEFAULT_STATUS, isStatusId } from './statuses.js';
import { isValidISODate } from './dates.js';

// Общие утилиты данных: генерация идентификаторов и нормализация записи,
// пришедшей из файла импорта или из другого источника.

export function createId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Приводит произвольный объект к валидной вакансии.
 * Возвращает null, если нет обязательных полей (компания и должность).
 */
export function normalizeVacancy(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const company = normalizeText(raw.company);
  const position = normalizeText(raw.position);
  if (!company || !position) return null;

  const now = new Date().toISOString();
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : createId(),
    company,
    position,
    status: isStatusId(raw.status) ? raw.status : DEFAULT_STATUS,
    testDeadline: isValidISODate(raw.testDeadline) ? raw.testDeadline : null,
    nextInterviewAt: isValidISODate(raw.nextInterviewAt) ? raw.nextInterviewAt : null,
    link: normalizeText(raw.link) || null,
    notes: typeof raw.notes === 'string' ? raw.notes.trim() : '',
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : now,
  };
}
