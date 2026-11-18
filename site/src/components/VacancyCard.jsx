import { useEffect, useRef, useState } from 'react';
import StatusBadge from './StatusBadge.jsx';
import DateBadge from './DateBadge.jsx';

export default function VacancyCard({ vacancy, highlighted, onEdit, onDelete }) {
  const { id, company, position, status, testDeadline, nextInterviewAt, link, notes } = vacancy;
  const hasDates = Boolean(testDeadline || nextInterviewAt);
  const [copied, setCopied] = useState(false);
  const timerRef = useRef(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const copyLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // Фоллбек для браузеров без Clipboard API / без https
      const area = document.createElement('textarea');
      area.value = link;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      document.body.removeChild(area);
    }

    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 1600);
  };

  return (
    <li
      className={`vacancy-card ${highlighted ? 'vacancy-card-highlight' : ''}`}
      data-vacancy-id={id}
    >
      <div className="vacancy-head">
        <div className="vacancy-titles">
          <h2 className="vacancy-company" title={company}>
            {company}
          </h2>
          <p className="vacancy-position" title={position}>
            {position}
          </p>
        </div>
        <StatusBadge status={status} />
      </div>

      <div className="vacancy-dates">
        <DateBadge label="Тестовое" date={testDeadline} kind="deadline" />
        <DateBadge label="Собеседование" date={nextInterviewAt} kind="interview" />
        {!hasDates && <span className="date-badge date-empty">Даты не указаны</span>}
      </div>

      {notes && (
        <p className="vacancy-notes" title={notes}>
          {notes}
        </p>
      )}

      <div className={`vacancy-footer ${link ? '' : 'vacancy-footer-actions-only'}`}>
        {link && (
          <div className="vacancy-link-row">
            <a className="vacancy-link" href={link} target="_blank" rel="noreferrer" title={link}>
              <svg
                className="vacancy-link-icon"
                width="13"
                height="13"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M6.5 9.5L13.5 2.5M13.5 2.5H8.5M13.5 2.5V7.5"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M11.5 8.5V12.5C11.5 13.0523 11.0523 13.5 10.5 13.5H3.5C2.94772 13.5 2.5 13.0523 2.5 12.5V5.5C2.5 4.94772 2.94772 4.5 3.5 4.5H7.5"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                />
              </svg>
              <span className="vacancy-link-text">{link}</span>
            </a>
            <button
              type="button"
              className={`btn btn-small btn-copy-link ${copied ? 'btn-copy-link-copied' : ''}`}
              onClick={copyLink}
              aria-label="Скопировать ссылку на вакансию"
            >
              {copied ? 'Скопировано' : 'Копировать'}
            </button>
          </div>
        )}

        <div className="vacancy-actions">
          <button type="button" className="btn btn-small" onClick={onEdit}>
            Изменить
          </button>
          <button type="button" className="btn btn-small btn-danger-ghost" onClick={onDelete}>
            Удалить
          </button>
        </div>
      </div>
    </li>
  );
}