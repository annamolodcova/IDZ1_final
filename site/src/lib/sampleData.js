import { addDaysISO, todayISO } from './dates.js';
import { createId } from './storage.js';

// Пять демо-вакансий: просроченный дедлайн, сегодня, +2 дня, +7 дней и запись без дат.
export function createSampleVacancies() {
  const today = todayISO();
  const now = new Date().toISOString();

  const make = (data) => ({
    testDeadline: null,
    nextInterviewAt: null,
    link: null,
    notes: '',
    ...data,
    id: createId(),
    createdAt: now,
    updatedAt: now,
  });

  return [
    make({
      company: 'Яндекс',
      position: 'Стажёр-аналитик',
      status: 'test',
      testDeadline: addDaysISO(today, -1),
      link: 'https://yandex.ru/jobs',
      notes: 'Тестовое: SQL и A/B-анализ. Сдать до конца дня, файл прислать рекрутеру.',
    }),
    make({
      company: 'Сбер',
      position: 'Junior Frontend-разработчик',
      status: 'interview',
      nextInterviewAt: today,
      notes: 'Созвон с командой в 15:00, ссылка в письме от рекрутера.',
    }),
    make({
      company: 'Т-Банк',
      position: 'Стажёр-разработчик',
      status: 'screening',
      nextInterviewAt: addDaysISO(today, 2),
      notes: 'Скрининг с рекрутером, обсуждаем формат стажировки.',
    }),
    make({
      company: 'Ozon',
      position: 'Junior QA-инженер',
      status: 'applied',
      testDeadline: addDaysISO(today, 7),
      notes: 'Отклик отправлен, ждём тестовое задание.',
    }),
    make({
      company: 'VK',
      position: 'Стажёр-продуктолог',
      status: 'rejected',
      notes: 'Отказ после скрининга. Вернуться через полгода.',
    }),
  ];
}
