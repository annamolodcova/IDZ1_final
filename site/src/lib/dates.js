// Даты в приложении хранятся строками YYYY-MM-DD (локальная календарная дата без времени).
// Все сравнения идут по номеру дня в UTC, чтобы переход на летнее/зимнее время не сдвигал дедлайны.

const MS_PER_DAY = 86_400_000;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const MONTHS_SHORT = ['янв.', 'февр.', 'мар.', 'апр.', 'мая', 'июн.', 'июл.', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'];
const MONTHS_GENITIVE = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

export function todayISO(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isValidISODate(value) {
  if (typeof value !== 'string') return false;
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

export function dayNumber(iso) {
  if (!isValidISODate(iso)) return null;
  const [year, month, day] = iso.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / MS_PER_DAY;
}

export function addDaysISO(iso, days) {
  const number = dayNumber(iso);
  if (number === null) return null;
  const shifted = new Date((number + days) * MS_PER_DAY);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function daysUntil(iso, today = todayISO()) {
  const target = dayNumber(iso);
  const base = dayNumber(today);
  if (target === null || base === null) return null;
  return target - base;
}

export function isPast(iso, today = todayISO()) {
  const diff = daysUntil(iso, today);
  return diff !== null && diff < 0;
}

// Ближайшая дата вакансии, которая ещё не прошла.
export function firstFutureDate(vacancy, today = todayISO()) {
  const candidates = [vacancy.testDeadline, vacancy.nextInterviewAt]
    .filter(isValidISODate)
    .filter((iso) => !isPast(iso, today));
  if (candidates.length === 0) return null;
  return candidates.reduce((min, current) => (dayNumber(current) < dayNumber(min) ? current : min));
}

// kind: 'deadline' — дедлайн тестового (прошёл = просрочен),
//       'interview' — собеседование (прошло = просто прошло).
export function relativeDate(iso, kind = 'deadline', today = todayISO()) {
  const diff = daysUntil(iso, today);
  if (diff === null) return null;
  if (diff < 0) {
    const days = -diff;
    if (kind === 'interview') return { tone: 'past', text: `прошло ${days} дн. назад` };
    return { tone: 'overdue', text: `просрочено на ${days} дн.` };
  }
  if (diff === 0) return { tone: 'today', text: 'сегодня' };
  if (diff === 1) return { tone: 'soon', text: 'завтра' };
  if (diff <= 2) return { tone: 'soon', text: `через ${diff} дн.` };
  return { tone: 'future', text: `через ${diff} дн.` };
}

export function formatShortDate(iso, today = todayISO()) {
  const number = dayNumber(iso);
  if (number === null) return '';
  const date = new Date(number * MS_PER_DAY);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const currentYear = Number(today.slice(0, 4));
  const base = `${day} ${MONTHS_SHORT[month]}`;
  return year === currentYear ? base : `${base} ${year}`;
}

export function formatFullDate(iso) {
  const number = dayNumber(iso);
  if (number === null) return '';
  const date = new Date(number * MS_PER_DAY);
  return `${date.getUTCDate()} ${MONTHS_GENITIVE[date.getUTCMonth()]} ${date.getUTCFullYear()} г.`;
}
