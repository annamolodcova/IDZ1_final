import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Toolbar from './components/Toolbar.jsx';
import VacancyCard from './components/VacancyCard.jsx';
import VacancyFormModal from './components/VacancyFormModal.jsx';
import ConfirmDialog from './components/ConfirmDialog.jsx';
import EmptyState from './components/EmptyState.jsx';
import HeatmapCalendar from './components/HeatmapCalendar.jsx';
import AuthScreen from './components/AuthScreen.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import JobSearchModal from './components/JobSearchModal.jsx';
import { useAuth } from './hooks/useAuth.js';
import { useVacanciesSql } from './hooks/useVacanciesSql.js';
import { STATUSES } from './lib/statuses.js';
import { dayNumber, firstFutureDate, isPast, todayISO } from './lib/dates.js';
import {
  buildExportFilename,
  buildExportPayload,
  downloadJson,
  parseImportFile,
} from './lib/exportImport.js';

const HIGHLIGHT_MS = 1800;
const NOTICE_MS = 3200;
const UNDO_MS = 6000;

// «ё» и регистр не должны мешать поиску: «стажер» находит «Стажёр».
function normalizeQuery(value) {
  return value.trim().toLowerCase().replace(/ё/g, 'е');
}

// Русская форма множественного числа: 1 запись, 2 записи, 5 записей.
function pluralRecords(count) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} запись`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} записи`;
  return `${count} записей`;
}

// Сначала просроченные дедлайны тестовых, затем ближайшие будущие даты,
// затем всё остальное (в том числе прошедшие собеседования) — по времени изменения.
function sortVacancies(vacancies) {
  return [...vacancies].sort((left, right) => {
    const leftOverdue = isPast(left.testDeadline);
    const rightOverdue = isPast(right.testDeadline);

    if (leftOverdue !== rightOverdue) return leftOverdue ? -1 : 1;
    if (leftOverdue && rightOverdue) {
      return dayNumber(left.testDeadline) - dayNumber(right.testDeadline);
    }

    const leftNext = firstFutureDate(left);
    const rightNext = firstFutureDate(right);
    if (leftNext && rightNext) return dayNumber(leftNext) - dayNumber(rightNext);
    if (leftNext) return -1;
    if (rightNext) return 1;

    return (right.updatedAt ?? '').localeCompare(left.updatedAt ?? '');
  });
}

function isTypingTarget(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable === true;
}

export default function App() {
  const { user, status, warning: authWarning, login, register, loginDemo, logout, rename } = useAuth();

  if (status === 'loading') {
    return (
      <div className="app">
        <div className="loading-state" role="status">
          Загрузка базы данных…
        </div>
      </div>
    );
  }

  if (status === 'guest') {
    return (
      <AuthScreen
        onLogin={login}
        onRegister={register}
        onDemo={loginDemo}
        storageWarning={authWarning}
      />
    );
  }

  return (
    <Diary
      user={user}
      onLogout={logout}
      onRename={rename}
      storageWarning={authWarning}
    />
  );
}

function Diary({ user, onLogout, onRename, storageWarning }) {
  const {
    vacancies,
    warning,
    initializing,
    addVacancy,
    updateVacancy,
    removeVacancy,
    restoreVacancy,
    importVacancies,
    loadSamples,
  } = useVacanciesSql(user.id);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [viewMode, setViewMode] = useState('list');
  const [formState, setFormState] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [pendingImport, setPendingImport] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [highlight, setHighlight] = useState(null);
  const [notice, setNotice] = useState(null);

  const addButtonRef = useRef(null);
  const profileButtonRef = useRef(null);
  const searchRef = useRef(null);
  const restoreFocusRef = useRef(null);
  const undoRef = useRef(null);

  const counts = useMemo(() => {
    const result = Object.fromEntries(STATUSES.map((item) => [item.id, 0]));
    for (const vacancy of vacancies) {
      if (Object.hasOwn(result, vacancy.status)) result[vacancy.status] += 1;
    }
    return result;
  }, [vacancies]);

  const overdueCount = useMemo(
    () => vacancies.filter((vacancy) => isPast(vacancy.testDeadline)).length,
    [vacancies],
  );

  const visibleVacancies = useMemo(() => {
    const query = normalizeQuery(search);
    const filtered = vacancies.filter((vacancy) => {
      if (statusFilter !== 'all' && vacancy.status !== statusFilter) return false;
      if (!query) return true;
      return (
        normalizeQuery(vacancy.company).includes(query) ||
        normalizeQuery(vacancy.position).includes(query)
      );
    });
    return sortVacancies(filtered);
  }, [vacancies, search, statusFilter]);

  const hasFilters = statusFilter !== 'all' || search.trim() !== '';
  const dataWarning = warning || storageWarning;
  const existingLinks = useMemo(
    () => new Set(vacancies.map((vacancy) => vacancy.link).filter(Boolean)),
    [vacancies],
  );

  // Подсветка и прокрутка к карточке. nonce в highlight гарантирует повтор
  // при повторном сохранении той же вакансии.
  useEffect(() => {
    if (!highlight) return undefined;
    const card = document.querySelector(`[data-vacancy-id="${highlight.id}"]`);
    card?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const timer = setTimeout(() => setHighlight(null), HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [highlight]);

  // Уведомление живёт дольше, если в нём есть «Отменить».
  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(null), notice.undo ? UNDO_MS : NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  const rememberFocus = () => {
    const active = document.activeElement;
    restoreFocusRef.current = active && active !== document.body ? active : null;
  };

  const restoreFocus = () => {
    const target = restoreFocusRef.current;
    restoreFocusRef.current = null;
    window.requestAnimationFrame(() => {
      if (target && target.isConnected && typeof target.focus === 'function') target.focus();
      else addButtonRef.current?.focus();
    });
  };

  const openCreate = useCallback(() => {
    rememberFocus();
    setFormState({ mode: 'create' });
  }, []);

  const openEdit = (vacancy) => {
    rememberFocus();
    setFormState({ mode: 'edit', vacancy });
  };

  const closeForm = () => {
    setFormState(null);
    restoreFocus();
  };

  const openDelete = (vacancy) => {
    rememberFocus();
    setPendingDelete(vacancy);
  };

  const closeDelete = () => {
    setPendingDelete(null);
    restoreFocus();
  };

  const resetFilters = () => {
    setSearch('');
    setStatusFilter('all');
  };

  const showHighlight = (id) => setHighlight({ id, ts: Date.now() });

  const handleSave = (payload) => {
    if (formState?.mode === 'edit') {
      const { id } = formState.vacancy;
      updateVacancy(id, payload);
      setNotice({ text: 'Изменения сохранены' });
      showHighlight(id);
    } else {
      const created = addVacancy(payload);
      setNotice({ text: 'Вакансия добавлена' });
      showHighlight(created.id);
    }
    closeForm();
  };

  const handleDeleteConfirm = () => {
    if (!pendingDelete) return;
    const removed = pendingDelete;
    removeVacancy(removed.id);
    undoRef.current = removed;
    setNotice({
      text: 'Вакансия удалена',
      undo: () => {
        restoreVacancy(undoRef.current);
        setNotice({ text: 'Вакансия восстановлена' });
        showHighlight(removed.id);
      },
    });
    closeDelete();
  };

  // Переход из календаря к карточке: если фильтры скрывают вакансию — сбрасываем их.
  const handleSelectFromCalendar = (id) => {
    const inList = visibleVacancies.some((vacancy) => vacancy.id === id);
    if (!inList) resetFilters();
    setViewMode('list');
    showHighlight(id);
  };

  const handleExport = () => {
    if (vacancies.length === 0) {
      setNotice({ text: 'Список пуст — экспортировать нечего' });
      return;
    }
    downloadJson(buildExportFilename(todayISO()), buildExportPayload(vacancies, user));
    setNotice({ text: 'Файл экспорта скачан' });
  };

  const handleImportFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const text = await file.text();
    const result = parseImportFile(text);
    if (!result.ok) {
      setNotice({ text: `Импорт не выполнен: ${result.error}` });
      return;
    }
    setSettingsOpen(false);
    setPendingImport(result.vacancies);
  };

  const confirmImport = () => {
    if (!pendingImport) return;
    importVacancies(pendingImport);
    setNotice({ text: `Импортировано: ${pluralRecords(pendingImport.length)}` });
    setPendingImport(null);
    resetFilters();
  };

  const openCatalog = () => {
    rememberFocus();
    setCatalogOpen(true);
  };

  const closeCatalog = () => {
    setCatalogOpen(false);
    restoreFocus();
  };

  const handleAddFromCatalog = (job) => {
    if (!job) return;
    if (job.url && existingLinks.has(job.url)) {
      setNotice({ text: 'Эта вакансия уже есть в дневнике' });
      return;
    }

    const created = addVacancy({
      company: job.company,
      position: job.position,
      status: 'applied',
      testDeadline: null,
      nextInterviewAt: null,
      link: job.url,
      notes: job.notes ?? '',
    });

    setNotice({ text: `Добавлено из каталога: ${job.position}` });
    showHighlight(created.id);
    closeCatalog();
  };

  const handleOpenSettings = () => {
    rememberFocus();
    setSettingsOpen(true);
  };

  const closeSettings = () => {
    setSettingsOpen(false);
    restoreFocus();
  };

  const handleLogout = () => {
    setSettingsOpen(false);
    setCatalogOpen(false);
    setFormState(null);
    setPendingDelete(null);
    setPendingImport(null);
    onLogout();
  };

  // Горячие клавиши: N — новая вакансия, / — поиск, 1–6 — фильтр статуса.
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (formState || pendingDelete || pendingImport || settingsOpen || catalogOpen) return;
      if (isTypingTarget(event.target)) return;

      if (event.key === 'n' || event.key === 'N' || event.key === 'т' || event.key === 'Т') {
        event.preventDefault();
        openCreate();
        return;
      }
      if (event.key === '/') {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (/^[1-6]$/.test(event.key)) {
        const status = STATUSES[Number(event.key) - 1];
        if (status && counts[status.id] > 0) {
          event.preventDefault();
          setStatusFilter(status.id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [formState, pendingDelete, pendingImport, settingsOpen, catalogOpen, counts, openCreate]);

  const showEmptyState = vacancies.length === 0;
  const showNoResults = !showEmptyState && visibleVacancies.length === 0;

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-top-row">
          <button
            ref={profileButtonRef}
            type="button"
            className="btn profile-button"
            onClick={handleOpenSettings}
            aria-label={`Профиль ${user.name} и настройки`}
          >
            <span className="profile-name">{user.name}</span>
          </button>
          <button ref={addButtonRef} type="button" className="btn btn-primary" onClick={openCreate}>
            + Вакансия
          </button>
        </div>

        <div className="app-heading">
          <h1 className="app-title">Карьерный дневник</h1>
          <p className="app-subtitle">
            Вакансии, дедлайны тестовых и этапы собеседований — в одном месте
          </p>
        </div>
      </header>

      {notice && (
        <div className="notice" role="status">
          <span>{notice.text}</span>
          {notice.undo && (
            <button type="button" className="notice-action" onClick={notice.undo}>
              Отменить
            </button>
          )}
        </div>
      )}

      {dataWarning && (
        <p className="warning-banner" role="status">
          {dataWarning}
        </p>
      )}

      {initializing ? (
        <div className="loading-state" role="status">
          Загрузка базы данных…
        </div>
      ) : (
        <>
          {!showEmptyState && (
            <Toolbar
              search={search}
              onSearchChange={setSearch}
              searchRef={searchRef}
              statusFilter={statusFilter}
              onStatusChange={setStatusFilter}
              total={vacancies.length}
              counts={counts}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              onOpenCatalog={openCatalog}
            />
          )}

          {!showEmptyState && (
            <div className="summary-bar" role="status" aria-live="polite">
              <span className="summary-pill summary-badge">
                <span className="summary-pill-label">{hasFilters ? 'Показано:' : 'Всего:'}</span>
                <strong className="summary-pill-num">
                  {hasFilters
                    ? `${visibleVacancies.length} из ${vacancies.length}`
                    : vacancies.length}
                </strong>
              </span>
              {overdueCount > 0 && (
                <span className="summary-pill summary-pill-overdue summary-badge">
                  <span className="summary-pill-label">Просрочено:</span>
                  <strong className="summary-pill-num">{overdueCount}</strong>
                </span>
              )}
            </div>
          )}

          {showEmptyState && (
            <EmptyState onAdd={openCreate} onLoadSamples={loadSamples} onFind={openCatalog} />
          )}

          {showNoResults && (
            <div className="empty-state empty-state-compact">
              <h2>Ничего не найдено</h2>
              <p>Попробуйте изменить запрос или сбросить фильтры.</p>
              <div className="empty-actions">
                <button type="button" className="btn" onClick={resetFilters}>
                  Сбросить фильтры
                </button>
              </div>
            </div>
          )}

          {viewMode === 'calendar' && !showNoResults && (
            <HeatmapCalendar vacancies={visibleVacancies} onSelectVacancy={handleSelectFromCalendar} />
          )}

          {viewMode === 'list' && visibleVacancies.length > 0 && (
            <ul className="vacancy-list">
              {visibleVacancies.map((vacancy) => (
                <VacancyCard
                  key={vacancy.id}
                  vacancy={vacancy}
                  highlighted={highlight?.id === vacancy.id}
                  onEdit={() => openEdit(vacancy)}
                  onDelete={() => openDelete(vacancy)}
                />
              ))}
            </ul>
          )}
        </>
      )}

      {formState && (
        <VacancyFormModal
          vacancy={formState.mode === 'edit' ? formState.vacancy : null}
          onSave={handleSave}
          onClose={closeForm}
        />
      )}

      {catalogOpen && (
        <JobSearchModal
          existingLinks={existingLinks}
          onAdd={handleAddFromCatalog}
          onClose={closeCatalog}
        />
      )}

      {settingsOpen && (
        <SettingsModal
          user={user}
          warning={dataWarning}
          onClose={closeSettings}
          onLogout={handleLogout}
          onRename={onRename}
          onExport={handleExport}
          onImportFile={handleImportFile}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Удалить вакансию?"
          message={`«${pendingDelete.company} · ${pendingDelete.position}» исчезнет из списка. Сразу после удаления его можно будет вернуть.`}
          confirmLabel="Удалить"
          cancelLabel="Отмена"
          onConfirm={handleDeleteConfirm}
          onCancel={closeDelete}
        />
      )}

      {pendingImport && (
        <ConfirmDialog
          title="Заменить все вакансии?"
          message={`Импорт заменит список профиля: ${pluralRecords(pendingImport.length)} из файла. Это действие нельзя отменить.`}
          confirmLabel={`Импортировать ${pendingImport.length}`}
          cancelLabel="Отмена"
          tone="primary"
          onConfirm={confirmImport}
          onCancel={() => setPendingImport(null)}
        />
      )}
    </div>
  );
}