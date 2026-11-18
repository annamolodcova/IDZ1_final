import { STATUSES } from '../lib/statuses.js';

const FILTER_LABELS = {
  test: 'Тестовое',
};

const VIEWS = [
  { id: 'list', label: 'Список' },
  { id: 'calendar', label: 'Календарь' },
];

export default function Toolbar({
  search,
  onSearchChange,
  statusFilter,
  onStatusChange,
  total,
  counts,
  viewMode,
  onViewModeChange,
  searchRef,
  onOpenCatalog,
}) {
  return (
    <div className="toolbar">
      <div className="toolbar-top">
        <div className="search-wrapper">
          <svg
            className="search-icon"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.75" />
            <path d="M11 11L14.5 14.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
          <input
            ref={searchRef}
            type="search"
            className="search-input"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Поиск по компании или должности"
            aria-label="Поиск по компании или должности"
          />
        </div>

        <button type="button" className="btn btn-small toolbar-find" onClick={onOpenCatalog}>
          Найти
        </button>

        <div className="segmented-control segmented-control-view" role="group" aria-label="Вид списка">
          {VIEWS.map((view) => (
            <button
              key={view.id}
              type="button"
              className={`segment ${viewMode === view.id ? 'segment-active' : ''}`}
              aria-pressed={viewMode === view.id}
              onClick={() => onViewModeChange(view.id)}
            >
              {view.label}
            </button>
          ))}
        </div>
      </div>

      <div className="segmented-control" role="group" aria-label="Фильтр по статусу">
        <button
          type="button"
          className={`segment ${statusFilter === 'all' ? 'segment-active' : ''}`}
          aria-pressed={statusFilter === 'all'}
          onClick={() => onStatusChange('all')}
        >
          <span className="segment-label">Все</span>
          <span className="segment-count">{total}</span>
        </button>

        {STATUSES.map((status) => {
          const count = counts[status.id] ?? 0;
          return (
            <button
              key={status.id}
              type="button"
              className={`segment ${statusFilter === status.id ? 'segment-active' : ''}`}
              aria-pressed={statusFilter === status.id}
              disabled={count === 0}
              onClick={() => onStatusChange(status.id)}
            >
              <span className="segment-label">{FILTER_LABELS[status.id] ?? status.label}</span>
              <span className="segment-count">{count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}