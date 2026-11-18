import { formatFullDate, formatShortDate, isValidISODate, relativeDate } from '../lib/dates.js';

export default function DateBadge({ label, date, kind = 'deadline' }) {
  if (!isValidISODate(date)) return null;
  const relative = relativeDate(date, kind);
  if (!relative) return null;

  return (
    <span className={`date-badge date-${relative.tone}`} title={formatFullDate(date)}>
      <span className="date-badge-label">{label}:</span> {relative.text}{' '}
      <span className="date-badge-abs">· {formatShortDate(date)}</span>
    </span>
  );
}
