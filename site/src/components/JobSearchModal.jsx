import { useEffect, useRef, useState } from 'react';
import { DEFAULT_SOURCE, SOURCES, searchJobs } from '../lib/jobsApi.js';

export default function JobSearchModal({ existingLinks, onAdd, onClose }) {
  const [sourceId, setSourceId] = useState(DEFAULT_SOURCE);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | loading | more | ready | error
  const [error, setError] = useState(null);
  const [hint, setHint] = useState(null);

  const dialogRef = useRef(null);
  const searchRef = useRef(null);
  const abortRef = useRef(null);

  const source = SOURCES.find((item) => item.id === sourceId) ?? SOURCES[0];
  const trimmed = query.trim();
  const canSearch = trimmed.length >= 2;

  useEffect(() => {
    searchRef.current?.focus();
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;

      const focusables = [...dialogRef.current.querySelectorAll('button, input, a[href]')].filter(
        (element) => !element.disabled && element.offsetParent !== null,
      );
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !dialogRef.current.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialogRef.current.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  const resetResults = () => {
    abortRef.current?.abort();
    setItems([]);
    setTotal(0);
    setOffset(0);
    setHasMore(false);
    setError(null);
    setStatus('idle');
  };

  const runSearch = async ({ append = false, rawQuery } = {}) => {
    const value = (rawQuery ?? query).trim();

    if (value.length < 2) {
      setHint('Введите хотя бы два символа — должность или компанию');
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setHint(null);
    setError(null);
    setStatus(append ? 'more' : 'loading');

    const nextOffset = append ? offset + (source.pageSize ?? 10) : 0;

    try {
      const result = await searchJobs(sourceId, value, {
        offset: nextOffset,
        signal: controller.signal,
      });
      setItems((prev) => (append ? [...prev, ...result.items] : result.items));
      setTotal(result.total);
      setOffset(nextOffset);
      setHasMore(result.hasMore);
      setStatus('ready');
    } catch (requestError) {
      setError(requestError.message);
      setStatus('error');
    }
  };

  const submit = (event) => {
    event.preventDefault();
    // Значение берём из поля: так отправка не зависит от того, успел ли обновиться стейт.
    const input = event.currentTarget.querySelector('input');
    const value = input?.value ?? query;
    setQuery(value);
    runSearch({ rawQuery: value });
  };

  const changeSource = (id) => {
    if (id === sourceId) return;
    setSourceId(id);
    resetResults();
  };

  const isDuplicate = (job) => Boolean(job.url && existingLinks.has(job.url));
  const searching = status === 'loading';

  return (
    <div
      className="modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="modal job-search-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="job-search-title"
      >
        <h2 id="job-search-title" className="modal-title">
          Найти вакансию
        </h2>

        <div className="segmented-control job-search-sources" role="group" aria-label="Источник вакансий">
          {SOURCES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`segment ${item.id === sourceId ? 'segment-active' : ''}`}
              aria-pressed={item.id === sourceId}
              onClick={() => changeSource(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <p className="job-search-source">
          {source.title} · {source.hint}
          {source.slow ? ' · отвечает 5–10 секунд' : ''}
        </p>

        <form className="job-search-form" onSubmit={submit} role="search">
          <div className="field-input-with-button">
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setHint(null);
              }}
              placeholder={
                source.id === 'remotive' ? 'Например, developer или analyst' : 'Например, аналитик'
              }
              aria-label="Поиск вакансий в каталоге"
              aria-invalid={Boolean(hint)}
              aria-describedby={hint ? 'job-search-hint' : undefined}
            />
            <button type="submit" className="btn" disabled={searching}>
              {searching ? 'Ищу…' : 'Искать'}
            </button>
          </div>
          {hint && (
            <p className="field-error" id="job-search-hint">
              {hint}
            </p>
          )}
        </form>

        <div className="job-search-body" aria-live="polite">
          {status === 'idle' && (
            <p className="job-search-placeholder">
              Введите должность или компанию и нажмите «Искать». Найденные вакансии добавляются в
              дневник по одной.
            </p>
          )}

          {searching && (
            <p className="job-search-placeholder">
              Ищу в «{source.title}»…
              {source.slow ? ' Каталог отвечает медленно, подождите до 10 секунд.' : ''}
            </p>
          )}

          {status === 'error' && (
            <div className="job-search-error" role="alert">
              <p>{error}</p>
              <button type="button" className="btn btn-small" onClick={() => runSearch()}>
                Повторить
              </button>
            </div>
          )}

          {status === 'ready' && items.length === 0 && (
            <p className="job-search-placeholder">
              Ничего не найдено. Попробуйте другой запрос
              {source.id === 'remotive' ? ' — этот каталог ищет по английским словам' : ''}.
            </p>
          )}

          {items.length > 0 && (
            <>
              <p className="job-search-count">
                Найдено: {total}. Показано {items.length}.
              </p>
              <ul className="job-results">
                {items.map((job) => {
                  const duplicate = isDuplicate(job);
                  return (
                    <li key={job.id} className="job-row">
                      <div className="job-row-main">
                        <p className="job-row-title" title={job.position}>
                          {job.position}
                        </p>
                        <p className="job-row-company" title={job.company}>
                          {job.company}
                        </p>
                        <p className="job-row-meta">
                          {[job.region, job.salary, job.employment].filter(Boolean).join(' · ') ||
                            'Условия не указаны'}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="btn btn-small job-row-action"
                        disabled={duplicate}
                        onClick={() => onAdd(job)}
                      >
                        {duplicate ? 'Уже в дневнике' : 'Добавить'}
                      </button>
                    </li>
                  );
                })}
              </ul>

              {hasMore && (
                <button
                  type="button"
                  className="btn btn-small job-search-more"
                  onClick={() => runSearch({ append: true })}
                  disabled={status === 'more'}
                >
                  {status === 'more' ? 'Загружаю…' : 'Показать ещё'}
                </button>
              )}
            </>
          )}
        </div>

        <div className="settings-footer">
          <span className="job-search-credit">
            Источник:{' '}
            <a
              href={source.id === 'remotive' ? 'https://remotive.com' : 'https://trudvsem.ru'}
              target="_blank"
              rel="noreferrer"
            >
              {source.title}
            </a>
          </span>
          <button type="button" className="btn" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}