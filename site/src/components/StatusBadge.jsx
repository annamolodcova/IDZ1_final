import { STATUS_MAP, DEFAULT_STATUS } from '../lib/statuses.js';

export default function StatusBadge({ status }) {
  const meta = STATUS_MAP[status] ?? STATUS_MAP[DEFAULT_STATUS];
  return <span className={`status-badge status-${meta.id}`}>{meta.label}</span>;
}
