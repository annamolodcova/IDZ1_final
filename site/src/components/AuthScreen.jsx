import { useEffect, useRef, useState } from 'react';
import { DEMO_CREDENTIALS, validateRegistration } from '../lib/auth.js';

const MODES = [
  { id: 'login', label: 'Вход' },
  { id: 'register', label: 'Регистрация' },
];

const EMPTY = { name: '', email: '', password: '' };

export default function AuthScreen({ onLogin, onRegister, onDemo, storageWarning }) {
  const [mode, setMode] = useState('login');
  const [values, setValues] = useState(EMPTY);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);
  const firstFieldRef = useRef(null);

  const isRegister = mode === 'register';

  useEffect(() => {
    firstFieldRef.current?.focus();
  }, [mode]);

  const setField = (field) => (event) => {
    const { value } = event.target;
    setValues((prev) => ({ ...prev, [field]: value }));
    setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
    setFormError(null);
  };

  const submit = async (event) => {
    event.preventDefault();
    setFormError(null);

    if (isRegister) {
      const errors = validateRegistration(values);
      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        return;
      }
    } else if (!values.email.trim() || !values.password) {
      setFieldErrors({
        email: values.email.trim() ? undefined : 'Введите почту',
        password: values.password ? undefined : 'Введите пароль',
      });
      return;
    }

    setBusy(true);
    const result = isRegister
      ? await onRegister(values)
      : await onLogin({ email: values.email, password: values.password });
    setBusy(false);

    if (!result.ok) {
      if (result.field) setFieldErrors({ [result.field]: result.error });
      else setFormError(result.error);
    }
  };

  const demo = async () => {
    setBusy(true);
    setFormError(null);
    const result = await onDemo();
    setBusy(false);
    if (!result.ok) setFormError(result.error);
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <header className="auth-head">
          <h1 className="auth-title">Карьерный дневник</h1>
          <p className="auth-subtitle">
            Вакансии, дедлайны тестовых и этапы собеседований — в одном месте
          </p>
        </header>

        <div className="segmented-control auth-modes" role="group" aria-label="Вход или регистрация">
          {MODES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`segment ${mode === item.id ? 'segment-active' : ''}`}
              aria-pressed={mode === item.id}
              onClick={() => {
                setMode(item.id);
                setFieldErrors({});
                setFormError(null);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        {storageWarning && (
          <p className="warning-banner" role="status">
            {storageWarning}
          </p>
        )}

        {formError && (
          <p className="warning-banner" role="alert">
            {formError}
          </p>
        )}

        <form className="auth-form" onSubmit={submit} noValidate>
          {isRegister && (
            <div className="field">
              <label htmlFor="auth-name">
                Имя <span className="required">*</span>
              </label>
              <input
                id="auth-name"
                ref={isRegister ? firstFieldRef : undefined}
                type="text"
                value={values.name}
                onChange={setField('name')}
                placeholder="Как к вам обращаться"
                autoComplete="name"
                aria-invalid={Boolean(fieldErrors.name)}
                aria-describedby={fieldErrors.name ? 'auth-name-error' : undefined}
              />
              {fieldErrors.name && (
                <p className="field-error" id="auth-name-error">
                  {fieldErrors.name}
                </p>
              )}
            </div>
          )}

          <div className="field">
            <label htmlFor="auth-email">
              Почта <span className="required">*</span>
            </label>
            <input
              id="auth-email"
              ref={isRegister ? undefined : firstFieldRef}
              type="email"
              value={values.email}
              onChange={setField('email')}
              placeholder="name@example.com"
              autoComplete="email"
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? 'auth-email-error' : undefined}
            />
            {fieldErrors.email && (
              <p className="field-error" id="auth-email-error">
                {fieldErrors.email}
              </p>
            )}
          </div>

          <div className="field">
            <label htmlFor="auth-password">
              Пароль <span className="required">*</span>
            </label>
            <input
              id="auth-password"
              type="password"
              value={values.password}
              onChange={setField('password')}
              placeholder={isRegister ? 'Не короче 6 символов' : 'Пароль'}
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={fieldErrors.password ? 'auth-password-error' : undefined}
            />
            {fieldErrors.password && (
              <p className="field-error" id="auth-password-error">
                {fieldErrors.password}
              </p>
            )}
          </div>

          <button type="submit" className="btn btn-primary auth-submit" disabled={busy}>
            {busy ? 'Подождите…' : isRegister ? 'Создать профиль' : 'Войти'}
          </button>
        </form>

        <div className="auth-demo">
          <p>
            Демо-профиль: {DEMO_CREDENTIALS.email} · {DEMO_CREDENTIALS.password}
          </p>
          <button type="button" className="btn btn-small" onClick={demo} disabled={busy}>
            Войти в демо
          </button>
        </div>

        <p className="auth-hint">
          Прототип авторизации: профили и вакансии хранятся в локальной SQLite в этом браузере.
          Внешних сервисов нет, пароль сохраняется только в виде хеша.
        </p>
      </div>
    </div>
  );
}