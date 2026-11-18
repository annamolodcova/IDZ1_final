// Логика сетки heatmap-календаря: недели по горизонтали, дни по вертикали.
// Тон клетки вычисляется по срочности событий дня (дедлайн тестового / собеседование).

import { dayNumber, isValidISODate, relativeDate, todayISO } from './dates.js';

export const TONE_PRIORITY = {
  overdue: 5,
  today: 4,
  soon: 3,
  past: 2,
  future: 1,
  empty: 0,
};

export const TONE_LABELS = {
  overdue: 'Просрочено',
  today: 'Сегодня',
  soon: 'Ближайшие 2 дня',
  past: 'Собеседование прошло',
  future: 'Позже',
  empty: 'Нет событий',
};

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTHS_SHORT = [
  'янв.',
  'февр.',
  'мар.',
  'апр.',
  'мая',
  'июн.',
  'июл.',
  'авг.',
  'сент.',
  'окт.',
  'нояб.',
  'дек.',
];

/**
 * Собирает события всех вакансий в Map<ISO-дата, событие[]>.
 * Событие: { vacancyId, company, position, status, type: 'deadline' | 'interview' }
 */
export function collectEvents(vacancies) {
  const map = new Map();

  const push = (iso, event) => {
    if (!isValidISODate(iso)) return;
    if (!map.has(iso)) map.set(iso, []);
    map.get(iso).push(event);
  };

  for (const vacancy of vacancies) {
    const base = {
      vacancyId: vacancy.id,
      company: vacancy.company,
      position: vacancy.position,
      status: vacancy.status,
    };
    push(vacancy.testDeadline, { ...base, type: 'deadline' });
    push(vacancy.nextInterviewAt, { ...base, type: 'interview' });
  }

  return map;
}

/**
 * Тон дня: самый «громкий» тон среди событий.
 * Прошедшее собеседование — нейтральное «past», в просрочку не попадает.
 */
export function dayTone(events, today) {
  if (!events || events.length === 0) return 'empty';

  let tone = 'empty';
  for (const event of events) {
    const relative = relativeDate(event.date, event.type === 'interview' ? 'interview' : 'deadline', today);
    if (!relative) continue;
    const next = relative.tone;
    if (TONE_PRIORITY[next] > TONE_PRIORITY[tone]) tone = next;
  }
  return tone;
}

/**
 * Начало недели (понедельник) для даты.
 */
function startOfWeekISO(iso) {
  const number = dayNumber(iso);
  const date = new Date(number * 86_400_000);
  const weekday = (date.getUTCDay() + 6) % 7; // Пн = 0
  return shiftISO(iso, -weekday);
}

function shiftISO(iso, days) {
  const number = dayNumber(iso);
  const shifted = new Date((number + days) * 86_400_000);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Строит сетку календаря.
 * @param {Array} vacancies
 * @param {{ today?: string, weeksBefore?: number, weeksAfter?: number }} options
 * @returns {{ weeks: Array, weekdays: string[], events: Map, today: string }}
 */
export function buildHeatmap(vacancies, { today = todayISO(), weeksBefore = 6, weeksAfter = 19 } = {}) {
  const events = collectEvents(vacancies);
  const firstWeekStart = shiftISO(startOfWeekISO(today), -weeksBefore * 7);
  const totalWeeks = weeksBefore + weeksAfter + 1;

  const weeks = [];
  let previousMonthKey = null;
  let lastLabelWeek = -10;

  for (let weekIndex = 0; weekIndex < totalWeeks; weekIndex += 1) {
    const weekStart = shiftISO(firstWeekStart, weekIndex * 7);
    const days = [];

    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      const iso = shiftISO(weekStart, dayIndex);
      const dayEvents = events.get(iso) ?? [];
      days.push({
        iso,
        dayOfMonth: Number(iso.slice(8, 10)),
        month: Number(iso.slice(5, 7)) - 1,
        isToday: iso === today,
        isFuture: dayNumber(iso) > dayNumber(today),
        tone: dayTone(
          dayEvents.map((event) => ({ ...event, date: iso })),
          today,
        ),
        events: dayEvents.map((event) => ({ ...event, date: iso })),
      });
    }

    // Месяц недели определяем по четвергу — он всегда внутри недели
    // и не даёт ярлыку «прыгать» на стыке месяцев.
    const thursday = days[3];
    const monthKey = thursday.iso.slice(0, 7);
    // Ярлык месяца не рисуем, если предыдущий стоит ближе трёх недель:
    // иначе короткие месяцы наезжают друг на друга.
    const wantedLabel = monthKey !== previousMonthKey;
    const monthLabel =
      wantedLabel && weekIndex - lastLabelWeek >= 3 ? MONTHS_SHORT[thursday.month] : null;
    if (monthLabel) lastLabelWeek = weekIndex;
    previousMonthKey = monthKey;

    weeks.push({ startISO: weekStart, monthKey, monthLabel, days });
  }

  return { weeks, weekdays: WEEKDAYS, events, today };
}