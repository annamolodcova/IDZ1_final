import { useEffect, useMemo, useRef, useState } from 'react';
import ConfirmDialog from './ConfirmDialog.jsx';
import { DEFAULT_STATUS, STATUSES } from '../lib/statuses.js';
import { loadVacancyFromHh } from '../lib/hhApi.js';

const EMPTY_VALUES = {
  company: '',
  position: '',
  status: DEFAULT_STATUS,
  testDeadline: '',
  nextInterviewAt: '',
  link: '',
  notes: '',
  hhUrl: '',
};

function toFormValues(vacancy) {
  if (!vacancy) return { ...EMPTY_VALUES };
  return {
    company: vacancy.company ?? '',
    position: vacancy.position ?? '',
    status: vacancy.status ?? DEFAULT_STATUS,
    testDeadline: vacancy.testDeadline ?? '',
    nextInterviewAt: vacancy.nextInterviewAt ?? '',
    link: vacancy.link ?? '',
    notes: vacancy.notes ?? '',
    hhUrl: '',
  };
}

function validate(values) {
  const errors = {};
  if (!values.company.trim()) errors.company = 'Укажите компанию';
  if (!values.position.trim()) errors.position = 'Укажите должность';

  const link = values.link.trim();
  if (link && !/^https?:\/\/\S+$/i.test(link)) {
    errors.link = 'Ссылка должна начинаться с http:// или https://';
  }
  return errors;
}

export default function VacancyFormModal({ vacancy, onSave, onClose }) {
  const [values, setValues] = useState(() => toFormValues(vacancy));
  const [submitted, setSubmitted] = useState(false);
  const [askDiscard, setAskDiscard] = useState(false);
  const [hhLoading, setHhLoading] = useState(false);
  const [hhError, setHhError] = useState(null);
  const firstFieldRef = useRef(null);
  const modalRef = useRef(null);
  const hhUrlRef = useRef(null);

  const initialValues = useMemo(() => toFormValues(vacancy), [vacancy]);
  const isDirty = useMemo(
    () => JSON.stringify(values) !== JSON.stringify(initialValues),
    [values, initialValues],
  );
  const errors = validate(values);
  const isEditing = Boolean(vacancy);

  useEffect(() => {
    firstFieldRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape' || askDiscard) return;
      if (isDirty) setAskDiscard(true);
      else onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [askDiscard, isDirty, onClose]);

  // Клавиатурная ловушка: Tab не уходит из формы на страницу под модалкой.
  useEffect(() => {
    if (askDiscard) return undefined;
    const handleTab = (event) => {
      if (event.key !== 'Tab' || !modalRef.current) return;
      const focusables = [...modalRef.current.querySelectorAll('button, input, select, textarea, a[href]')].filter(
        (element) => !element.disabled && element.offsetParent !== null,
      );
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !modalRef.current.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !modalRef.current.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleTab);
    return () => window.removeEventListener('keydown', handleTab);
  }, [askDiscard]);

  const requestClose = () => {
    if (isDirty) setAskDiscard(true);
    else onClose();
  };

  const setField = (field) => (event) => {
    const { value } = event.target;
    setValues((prev) => ({ ...prev, [field]: value }));
  };

  const handleHhLoad = async () => {
    const url = values.hhUrl.trim();
    if (!url) {
      setHhError('Вставьте ссылку на вакансию hh.ru');
      return;
    }

    setHhLoading(true);
    setHhError(null);

    const result = await loadVacancyFromHh(url);

    setHhLoading(false);

    if (result.ok) {
      // Не затираем то, что пользователь уже ввёл: заполняем пустые поля,
      // а заметки — только если они пустые.
      setValues((prev) => ({
        ...prev,
        company: result.data.company || prev.company,
        position: result.data.position || prev.position,
        link: result.data.link || prev.link,
        notes: prev.notes.trim() ? prev.notes : result.data.notes,
      }));
    } else {
      setHhError(result.error);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length > 0) return;

    onSave({
      company: values.company.trim(),
      position: values.position.trim(),
      status: values.status,
      testDeadline: values.testDeadline || null,
      nextInterviewAt: values.nextInterviewAt || null,
      link: values.link.trim() || null,
      notes: values.notes.trim(),
    });
  };

  const companyError = submitted ? errors.company : undefined;
  const positionError = submitted ? errors.position : undefined;
  const linkError = submitted ? errors.link : undefined;

  return (
    <div
      className="modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <div
        ref={modalRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vacancy-form-title"
      >
        <h2 id="vacancy-form-title" className="modal-title">
          {isEditing ? 'Редактировать вакансию' : 'Новая вакансия'}
        </h2>

        <form className="vacancy-form" onSubmit={handleSubmit} noValidate>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="company">
                Компания <span className="required">*</span>
              </label>
              <input
                id="company"
                ref={firstFieldRef}
                type="text"
                value={values.company}
                onChange={setField('company')}
                placeholder="Например, Яндекс"
                autoComplete="organization"
                aria-invalid={Boolean(companyError)}
                aria-describedby={companyError ? 'company-error' : undefined}
              />
              {companyError && (
                <p className="field-error" id="company-error">
                  {companyError}
                </p>
              )}
            </div>

            <div className="field">
              <label htmlFor="position">
                Должность <span className="required">*</span>
              </label>
              <input
                id="position"
                type="text"
                value={values.position}
                onChange={setField('position')}
                placeholder="Например, Стажёр-аналитик"
                aria-invalid={Boolean(positionError)}
                aria-describedby={positionError ? 'position-error' : undefined}
              />
              {positionError && (
                <p className="field-error" id="position-error">
                  {positionError}
                </p>
              )}
            </div>
          </div>

          <div className="field">
            <label htmlFor="status">Статус</label>
            <select id="status" value={values.status} onChange={setField('status')}>
              {STATUSES.map((status) => (
                <option key={status.id} value={status.id}>
                  {status.label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-grid">
            <div className="field">
              <label htmlFor="testDeadline">Дедлайн тестового</label>
              <input
                id="testDeadline"
                type="date"
                value={values.testDeadline}
                onChange={setField('testDeadline')}
              />
            </div>

            <div className="field">
              <label htmlFor="nextInterviewAt">Дата собеседования</label>
              <input
                id="nextInterviewAt"
                type="date"
                value={values.nextInterviewAt}
                onChange={setField('nextInterviewAt')}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="link">Ссылка на вакансию</label>
            <input
              id="link"
              type="url"
              value={values.link}
              onChange={setField('link')}
              placeholder="https://"
              aria-invalid={Boolean(linkError)}
              aria-describedby={linkError ? 'link-error' : undefined}
            />
            {linkError && (
              <p className="field-error" id="link-error">
                {linkError}
              </p>
            )}
          </div>

          <div className="field">
            <label htmlFor="hhUrl">Ссылка на hh.ru (автозаполнение)</label>
            <div className="field-input-with-button">
              <input
                ref={hhUrlRef}
                id="hhUrl"
                type="url"
                value={values.hhUrl}
                onChange={setField('hhUrl')}
                placeholder="https://hh.ru/vacancy/12345678"
                aria-invalid={Boolean(hhError)}
                aria-describedby={hhError ? 'hh-error' : undefined}
                disabled={hhLoading}
              />
              <button
                type="button"
                className="btn"
                onClick={handleHhLoad}
                disabled={hhLoading || !values.hhUrl.trim()}
              >
                {hhLoading ? 'Загрузка…' : 'Загрузить'}
              </button>
            </div>
            {hhError && (
              <p className="field-error" id="hh-error">
                {hhError}
              </p>
            )}
          </div>

          <div className="field">
            <label htmlFor="notes">Заметки</label>
            <textarea
              id="notes"
              rows={3}
              value={values.notes}
              onChange={setField('notes')}
              placeholder="Контакты, ссылка на созвон, что прислали"
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn" onClick={requestClose}>
              Отмена
            </button>
            <button type="submit" className="btn btn-primary">
              Сохранить
            </button>
          </div>
        </form>
      </div>

      {askDiscard && (
        <ConfirmDialog
          title="Закрыть без сохранения?"
          message="Введённые данные не сохранятся."
          confirmLabel="Закрыть без сохранения"
          cancelLabel="Вернуться к форме"
          onConfirm={onClose}
          onCancel={() => setAskDiscard(false)}
        />
      )}
    </div>
  );
}
