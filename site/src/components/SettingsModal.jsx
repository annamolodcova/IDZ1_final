import { useEffect, useRef, useState } from 'react';

export default function SettingsModal({
  user,
  warning,
  onClose,
  onLogout,
  onRename,
  onExport,
  onImportFile,
}) {
  const [name, setName] = useState(user?.name ?? '');
  const [nameError, setNameError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;

      const focusables = [
        ...dialogRef.current.querySelectorAll('button, input, a[href]'),
      ].filter((element) => !element.disabled && element.offsetParent !== null);
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

  const saveName = async () => {
    setNameError(null);
    setSaved(false);
    setBusy(true);
    const result = await onRename(name);
    setBusy(false);
    if (result.ok) setSaved(true);
    else setNameError(result.error);
  };

  return (
    <div
      className="modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="modal settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <h2 id="settings-title" className="modal-title">
          Настройки
        </h2>

        <section className="settings-section" aria-labelledby="settings-profile">
          <h3 id="settings-profile" className="settings-heading">
            Профиль
          </h3>

          <div className="field">
            <label htmlFor="settings-name">Имя</label>
            <div className="field-input-with-button">
              <input
                id="settings-name"
                type="text"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setNameError(null);
                  setSaved(false);
                }}
                autoComplete="name"
                aria-invalid={Boolean(nameError)}
                aria-describedby={nameError ? 'settings-name-error' : undefined}
              />
              <button
                type="button"
                className="btn"
                onClick={saveName}
                disabled={busy || name.trim() === user?.name}
              >
                Сохранить
              </button>
            </div>
            {nameError && (
              <p className="field-error" id="settings-name-error">
                {nameError}
              </p>
            )}
            {saved && !nameError && <p className="field-hint">Имя обновлено</p>}
          </div>

          <dl className="settings-meta">
            <div>
              <dt>Почта</dt>
              <dd>{user?.email}</dd>
            </div>
            <div>
              <dt>Профиль создан</dt>
              <dd>{user?.createdAt ? new Date(user.createdAt).toLocaleDateString('ru-RU') : '—'}</dd>
            </div>
          </dl>
        </section>

        <section className="settings-section" aria-labelledby="settings-data">
          <h3 id="settings-data" className="settings-heading">
            Данные
          </h3>
          <p className="settings-note">
            Экспорт сохраняет вакансии текущего профиля в JSON. Импорт заменяет список этого
            профиля записями из файла, другие профили не затрагиваются.
          </p>
          <div className="settings-actions">
            <button type="button" className="btn btn-small" onClick={onExport}>
              Экспорт JSON
            </button>
            <button type="button" className="btn btn-small" onClick={() => fileInputRef.current?.click()}>
              Импорт JSON
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="visually-hidden"
              onChange={onImportFile}
            />
          </div>
        </section>

        <section className="settings-section" aria-labelledby="settings-storage">
          <h3 id="settings-storage" className="settings-heading">
            Хранилище
          </h3>
          <p className="settings-note">
            Локальная база SQLite: данные сохраняются в файл <code>career-diary.sqlite</code> в
            папке проекта на вашем компьютере и синхронизируются с дисковым хранилищем браузера
            (OPFS / IndexedDB).
          </p>
          {warning && (
            <p className="warning-banner" role="status">
              {warning}
            </p>
          )}
        </section>

        <div className="settings-footer">
          <button type="button" className="btn btn-danger-ghost" onClick={onLogout}>
            Выйти из профиля
          </button>
          <button ref={closeRef} type="button" className="btn" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}