/**
 * Внешние каталоги вакансий. Оба источника — открытые данные без ключа API:
 *
 *   1. «Работа России» (opendata.trudvsem.ru) — вакансии РФ, поиск по тексту,
 *      пагинация. Сервер отвечает медленно (5–10 с), поэтому таймаут больше.
 *   2. Remotive (remotive.com/api/remote-jobs) — удалённые вакансии, поиск,
 *      отвечает быстро. Нужен как быстрый и надёжный запасной вариант.
 *
 * Запросы идут только по действию пользователя, результаты кэшируются на 10 минут.
 */

const CACHE_TTL = 10 * 60 * 1000;
const DEFAULT_PAGE_SIZE = 10;
const NOTES_LIMIT = 600;

export const SOURCES = [
  {
    id: 'trudvsem',
    label: 'Россия',
    title: 'Работа России',
    hint: 'открытые данные trudvsem.ru, без ключа API',
    timeout: 20000,
    pageSize: 10,
    slow: true,
  },
  {
    id: 'remotive',
    label: 'Удалённо',
    title: 'Remotive',
    hint: 'открытые данные remotive.com, без ключа API',
    timeout: 8000,
    pageSize: 20,
    slow: false,
  },
];

export const DEFAULT_SOURCE = 'trudvsem';

const cache = new Map();

function getSource(id) {
  return SOURCES.find((source) => source.id === id) ?? SOURCES[0];
}

function normalizeQuery(value) {
  return String(value ?? '').trim().replace(/ё/g, 'е');
}

function cleanText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\s([,.;:])/g, '$1')
    .trim();
}

function cleanHtml(value) {
  const html = String(value ?? '');
  if (!html) return '';
  if (typeof document === 'undefined') {
    return cleanText(html.replace(/<[^>]+>/g, ' '));
  }
  const container = document.createElement('div');
  container.innerHTML = html;
  return cleanText(container.textContent || '');
}

function truncate(text) {
  return text.length > NOTES_LIMIT ? `${text.slice(0, NOTES_LIMIT - 1).trimEnd()}…` : text;
}

/* ----------------------------- Работа России ------------------------------ */

function mapTrudvsem(vacancy) {
  if (!vacancy) return null;

  const url = typeof vacancy.vac_url === 'string' ? vacancy.vac_url : null;
  const notes = [...new Set([vacancy.duty, vacancy.requirements].map(cleanText).filter(Boolean))]
    .join(' ');

  return {
    id: String(vacancy.id ?? url ?? Math.random()),
    source: 'trudvsem',
    company: cleanText(vacancy.company?.name) || 'Компания не указана',
    position: cleanText(vacancy['job-name']) || 'Без названия',
    region: cleanText(vacancy.region?.name),
    salary: cleanText(vacancy.salary),
    employment: cleanText(vacancy.employment),
    url,
    notes: truncate(notes),
  };
}

async function fetchTrudvsem(query, { limit, offset, signal, timeout }) {
  const params = new URLSearchParams({
    text: query,
    limit: String(limit),
    offset: String(offset),
  });
  const payload = await requestJson(
    `https://opendata.trudvsem.ru/api/v1/vacancies?${params}`,
    timeout,
    signal,
  );

  const list = Array.isArray(payload?.results?.vacancies) ? payload.results.vacancies : [];
  const items = list.map((item) => mapTrudvsem(item.vacancy)).filter(Boolean);
  const total = Number(payload?.meta?.total ?? items.length);

  return { items, total };
}

/* -------------------------------- Remotive -------------------------------- */

const REMOTIVE_JOB_TYPES = {
  full_time: 'полная занятость',
  part_time: 'частичная занятость',
  contract: 'контракт',
  freelance: 'фриланс',
  internship: 'стажировка',
  temporary: 'временная работа',
};

function mapRemotive(job) {
  if (!job) return null;

  return {
    id: String(job.id ?? job.url ?? Math.random()),
    source: 'remotive',
    company: cleanText(job.company_name) || 'Компания не указана',
    position: cleanText(job.title) || 'Без названия',
    region: cleanText(job.candidate_required_location),
    salary: cleanText(job.salary),
    employment: REMOTIVE_JOB_TYPES[job.job_type] ?? cleanText(job.job_type),
    url: typeof job.url === 'string' ? job.url : null,
    notes: truncate(cleanHtml(job.description)),
  };
}

async function fetchRemotive(query, { limit, signal, timeout }) {
  const params = new URLSearchParams({ search: query, limit: String(limit) });
  const payload = await requestJson(
    `https://remotive.com/api/remote-jobs?${params}`,
    timeout,
    signal,
  );

  const list = Array.isArray(payload?.jobs) ? payload.jobs : [];
  const items = list.map(mapRemotive).filter(Boolean);

  return { items, total: Number(payload?.['job-count'] ?? items.length) };
}

/* --------------------------------- Запрос --------------------------------- */

async function requestJson(url, timeout, signal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);

  try {
    const response = await fetch(url, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = new Error(
        response.status === 429
          ? 'Каталог ограничил частоту запросов. Попробуйте через минуту.'
          : `Каталог ответил ошибкой ${response.status}. Попробуйте позже.`,
      );
      error.status = response.status;
      throw error;
    }

    return await response.json();
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Каталог не ответил вовремя. Попробуйте другой источник или повторите позже.');
    }
    if (error.status) throw error;
    throw new Error('Не удалось связаться с каталогом. Проверьте подключение.');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/**
 * Поиск вакансий во внешнем каталоге.
 * @param {'trudvsem'|'remotive'} sourceId
 * @param {string} query
 * @param {{ offset?: number, signal?: AbortSignal }} options
 * @returns {Promise<{ total: number, items: object[], hasMore: boolean, source: object }>}
 */
export async function searchJobs(sourceId, query, { offset = 0, signal } = {}) {
  const source = getSource(sourceId);
  const normalized = normalizeQuery(query);

  if (normalized.length < 2) {
    return { total: 0, items: [], hasMore: false, source };
  }

  const cacheKey = `${source.id}|${normalized}|${offset}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const limit = source.pageSize ?? DEFAULT_PAGE_SIZE;
  const request = {
    limit,
    offset,
    signal,
    timeout: source.timeout,
  };

  const result =
    source.id === 'remotive'
      ? await fetchRemotive(normalized, request)
      : await fetchTrudvsem(normalized, request);

  const data = {
    items: result.items,
    total: result.total,
    hasMore: source.id === 'remotive' ? false : offset + result.items.length < result.total,
    source,
  };

  cache.set(cacheKey, { data, timestamp: Date.now() });
  return data;
}