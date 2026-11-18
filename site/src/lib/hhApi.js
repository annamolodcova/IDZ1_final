/**
 * Интеграция с публичным API hh.ru.
 *
 * GET https://api.hh.ru/vacancies/{id} — открытый эндпоинт без OAuth.
 * CORS у hh.ru открыт (`access-control-allow-origin: *`), поэтому запрос
 * идёт напрямую; в dev при сетевой ошибке пробуем прокси Vite.
 *
 * Важно: hh.ru может отвечать 403 (DDoS-Guard) при обращении из некоторых
 * сетей и регионов. Это не ошибка приложения — интерфейс просто просит
 * заполнить поля вручную.
 */

const HH_API_BASE = 'https://api.hh.ru';
const CACHE_TTL = 5 * 60 * 1000;
const cache = new Map();

/**
 * Достаёт ID вакансии из ссылки hh.ru.
 * Поддерживает:
 *   https://hh.ru/vacancy/12345678
 *   https://hh.ru/vacancy/12345678?query=...
 *   https://api.hh.ru/vacancies/12345678
 *   просто число 12345678
 */
export function parseHhUrl(url) {
  if (!url || typeof url !== 'string') return null;

  const trimmed = url.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;

  const patterns = [/hh\.ru\/vacancy\/(\d+)/i, /api\.hh\.ru\/vacancies\/(\d+)/i];
  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match) return match[1];
  }

  return null;
}

function statusErrorMessage(status) {
  if (status === 404) return 'Вакансия не найдена (404). Проверьте ссылку.';
  if (status === 403) {
    return 'hh.ru отклонил запрос (403): доступ ограничен по сети или региону. Заполните поля вручную.';
  }
  if (status === 429) return 'Слишком много запросов к hh.ru. Попробуйте через минуту.';
  return `hh.ru ответил ошибкой ${status}. Попробуйте позже или заполните поля вручную.`;
}

async function requestJson(url) {
  const response = await fetch(url, {
    method: 'GET',
    mode: 'cors',
    credentials: 'omit',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    const error = new Error(statusErrorMessage(response.status));
    error.status = response.status;
    throw error;
  }

  return response.json();
}

/**
 * Загружает вакансию по ID с кэшем на 5 минут (лимит hh.ru — 120 запросов/мин).
 */
export async function fetchVacancy(vacancyId) {
  if (!vacancyId) throw new Error('Не указан ID вакансии');

  const cacheKey = `vacancy:${vacancyId}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) return cached.data;

  const directUrl = `${HH_API_BASE}/vacancies/${vacancyId}`;
  let data;

  try {
    data = await requestJson(directUrl);
  } catch (error) {
    // Прокси имеет смысл только в dev и только при сетевой ошибке,
    // а не при осмысленном ответе API (403/404/429).
    const isNetworkError = !error.status;
    if (!isNetworkError || !import.meta.env.DEV) throw error;
    data = await requestJson(`/api/hh/vacancies/${vacancyId}`);
  }

  cache.set(cacheKey, { data, timestamp: Date.now() });
  return data;
}

/**
 * Превращает ответ hh.ru в поля формы.
 */
export function mapHhToForm(hhData) {
  if (!hhData) return {};

  const cleanText = (html) => {
    if (!html) return '';
    const container = document.createElement('div');
    container.innerHTML = html;
    return (container.textContent || '').replace(/\s+\n/g, '\n').trim();
  };

  return {
    company: hhData.employer?.name ?? '',
    position: hhData.name ?? '',
    notes: cleanText(hhData.description),
    link: hhData.alternate_url ?? '',
  };
}

/**
 * Разбор ссылки → запрос → поля формы.
 * @returns {Promise<{ ok: true, data: object } | { ok: false, error: string }>}
 */
export async function loadVacancyFromHh(url) {
  const vacancyId = parseHhUrl(url);
  if (!vacancyId) {
    return {
      ok: false,
      error: 'Не удалось найти ID вакансии. Пример ссылки: https://hh.ru/vacancy/12345678',
    };
  }

  try {
    const hhData = await fetchVacancy(vacancyId);
    return { ok: true, data: mapHhToForm(hhData) };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}