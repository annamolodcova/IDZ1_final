import { useEffect, useMemo, useRef, useState } from 'react';
import { buildHeatmap, TONE_LABELS } from '../lib/heatmap.js';
import { formatFullDate, relativeDate, todayISO } from '../lib/dates.js';
import { STATUS_MAP } from '../lib/statuses.js';

const TONE_ORDER = ['overdue', 'today', 'soon', 'future', 'past', 'empty'];

function formatDayTitle(iso, events) {
  const date = formatFullDate(iso);
  if (!events || events.length === 0) return `${date} — нет событий`;
  const list = events
    .map((event) => `${event.company} · ${event.type === 'deadline' ? 'тестовое' : 'собеседование'}`)
    .join('; ');
  return `${date} — ${list}`;
}

export default function HeatmapCalendar({ vacancies, onSelectVacancy }) {
  const today = todayISO();
  const { weeks, weekdays } = useMemo(() => buildHeatmap(vacancies, { today }), [vacancies, today]);

  const initialIso = useMemo(() => {
    const todayCell = weeks.flatMap((week) => week.days).find((day) => day.isToday);
    return todayCell?.iso ?? weeks[0]?.days[0]?.iso ?? today;
  }, [weeks, today]);

  const [focusedIso, setFocusedIso] = useState(initialIso);
  const [hoveredIso, setHoveredIso] = useState(null);
  const cellRefs = useRef(new Map());
  const shouldFocusRef = useRef(false);

  const findDay = (iso) => {
    for (const week of weeks) {
      const day = week.days.find((item) => item.iso === iso);
      if (day) return day;
    }
    return null;
  };

  const detailDay = findDay(hoveredIso ?? focusedIso);

  useEffect(() => {
    if (!shouldFocusRef.current) return;
    shouldFocusRef.current = false;
    cellRefs.current.get(focusedIso)?.focus();
  }, [focusedIso]);

  const moveFocus = (weekIndex, dayIndex) => {
    const next = weeks[weekIndex]?.days[dayIndex];
    if (!next) return;
    shouldFocusRef.current = true;
    setFocusedIso(next.iso);
  };

  const handleKeyDown = (event, weekIndex, dayIndex) => {
    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault();
        moveFocus(weekIndex - 1, dayIndex);
        break;
      case 'ArrowRight':
        event.preventDefault();
        moveFocus(weekIndex + 1, dayIndex);
        break;
      case 'ArrowUp':
        event.preventDefault();
        moveFocus(weekIndex, (dayIndex + 6) % 7);
        break;
      case 'ArrowDown':
        event.preventDefault();
        moveFocus(weekIndex, (dayIndex + 1) % 7);
        break;
      case 'Home':
        event.preventDefault();
        moveFocus(weekIndex, 0);
        break;
      case 'End':
        event.preventDefault();
        moveFocus(weekIndex, 6);
        break;
      default:
        break;
    }
  };

  return (
    <section className="heatmap" aria-label="Календарь дедлайнов и собеседований">
      <div className="heatmap-calendar">
        <div className="heatmap-months" aria-hidden="true">
          {weeks.map((week) => (
            <span key={week.startISO} className="heatmap-month-slot">
              {week.monthLabel && <span className="heatmap-month">{week.monthLabel}</span>}
            </span>
          ))}
        </div>

        <div className="heatmap-body">
          <div className="heatmap-weekdays" aria-hidden="true">
            {weekdays.map((label) => (
              <span key={label} className="heatmap-weekday">
                {label}
              </span>
            ))}
          </div>

          <div
            className="heatmap-grid"
            role="grid"
            aria-label="Дни с дедлайнами и собеседованиями. Стрелки — навигация, Enter — перейти к вакансии."
          >
            {weekdays.map((weekday, dayIndex) => (
              <div className="heatmap-row" role="row" key={weekday}>
                {weeks.map((week, weekIndex) => {
                  const day = week.days[dayIndex];
                  const selected = day.iso === focusedIso;
                  return (
                    <button
                      key={day.iso}
                      ref={(node) => {
                        if (node) cellRefs.current.set(day.iso, node);
                        else cellRefs.current.delete(day.iso);
                      }}
                      type="button"
                      role="gridcell"
                      tabIndex={selected ? 0 : -1}
                      aria-selected={selected}
                      aria-label={formatDayTitle(day.iso, day.events)}
                      title={formatDayTitle(day.iso, day.events)}
                      className={`heatmap-cell heatmap-tone-${day.tone} ${
                        day.isToday ? 'heatmap-cell-current' : ''
                      } ${day.events.length > 0 ? 'heatmap-cell-has-events' : ''}`}
                      onMouseEnter={() => setHoveredIso(day.iso)}
                      onMouseLeave={() => setHoveredIso(null)}
                      onFocus={() => setFocusedIso(day.iso)}
                      onKeyDown={(event) => handleKeyDown(event, weekIndex, dayIndex)}
                      onClick={() => {
                        const first = day.events[0];
                        if (first) onSelectVacancy?.(first.vacancyId);
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="heatmap-footer">
        <div className="heatmap-detail" aria-live="polite">
          {detailDay && (
            <>
              <p className="heatmap-detail-date">
                {formatFullDate(detailDay.iso)}
                {detailDay.isToday ? ' · сегодня' : ''}
              </p>
              {detailDay.events.length === 0 ? (
                <p className="heatmap-detail-empty">Нет событий</p>
              ) : (
                <ul className="heatmap-events">
                  {detailDay.events.map((event) => {
                    const relative = relativeDate(
                      event.date,
                      event.type === 'interview' ? 'interview' : 'deadline',
                      today,
                    );
                    const statusLabel = STATUS_MAP[event.status]?.label ?? '';
                    return (
                      <li key={`${event.vacancyId}-${event.type}`} className="heatmap-event">
                        <button
                          type="button"
                          className="heatmap-event-link"
                          onClick={() => onSelectVacancy?.(event.vacancyId)}
                        >
                          {event.company} · {event.position}
                        </button>
                        <span className="heatmap-event-meta">
                          {event.type === 'deadline' ? 'Тестовое' : 'Собеседование'}
                          {relative ? ` · ${relative.text}` : ''}
                          {statusLabel ? ` · ${statusLabel}` : ''}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </div>

        <ul className="heatmap-legend" aria-label="Легенда цветов">
          {TONE_ORDER.map((tone) => (
            <li key={tone} className="heatmap-legend-item">
              <span className={`heatmap-swatch heatmap-tone-${tone}`} aria-hidden="true" />
              <span>{TONE_LABELS[tone]}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}