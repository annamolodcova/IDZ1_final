export default function EmptyState({ onAdd, onLoadSamples, onFind }) {
  return (
    <div className="empty-state">
      <h2>Пока ни одной вакансии</h2>
      <p>Добавьте первый отклик — дедлайны тестовых и этапы собеседований будут в одном списке.</p>
      <div className="empty-actions">
        <button type="button" className="btn btn-primary" onClick={onAdd}>
          Добавить первую
        </button>
        <button type="button" className="btn" onClick={onLoadSamples}>
          Загрузить примеры
        </button>
        <button type="button" className="btn" onClick={onFind}>
          Найти в каталоге
        </button>
      </div>
      <p className="empty-hint">
        Данные сохраняются в локальный SQLite-файл career-diary.sqlite в папке проекта. Примеры — демонстрационные, их можно удалить.
      </p>
    </div>
  );
}
