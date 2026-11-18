import { useCallback, useEffect, useState } from 'react';
import { initDatabase, getStorageWarning } from '../lib/db.js';
import {
  getCurrentUser,
  login as loginRequest,
  loginDemo as loginDemoRequest,
  logout as logoutRequest,
  register as registerRequest,
  updateProfileName,
} from '../lib/auth.js';

/**
 * Состояние авторизации: загрузка → гость → вошедший пользователь.
 * Сессия хранится в localStorage, поэтому вход переживает перезагрузку.
 */
export function useAuth() {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading');
  const [warning, setWarning] = useState(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        await initDatabase();
        if (cancelled) return;
        const current = getCurrentUser();
        setUser(current);
        setStatus(current ? 'authenticated' : 'guest');
        setWarning(getStorageWarning());
      } catch (error) {
        console.error('Не удалось открыть базу данных:', error);
        if (cancelled) return;
        setStatus('guest');
        setWarning('Не удалось открыть базу данных — данные не сохранятся.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (credentials) => {
    const result = await loginRequest(credentials);
    if (result.ok) {
      setUser(result.user);
      setStatus('authenticated');
    }
    return result;
  }, []);

  const register = useCallback(async (payload) => {
    const result = await registerRequest(payload);
    if (result.ok) {
      setUser(result.user);
      setStatus('authenticated');
    }
    return result;
  }, []);

  const loginDemo = useCallback(async () => {
    const result = await loginDemoRequest();
    if (result.ok) {
      setUser(result.user);
      setStatus('authenticated');
    }
    return result;
  }, []);

  const logout = useCallback(() => {
    logoutRequest();
    setUser(null);
    setStatus('guest');
  }, []);

  const rename = useCallback(
    async (name) => {
      if (!user) return { ok: false, error: 'Нет активного профиля' };
      const result = await updateProfileName(user.id, name);
      if (result.ok) setUser(result.user);
      return result;
    },
    [user],
  );

  return { user, status, warning, login, register, loginDemo, logout, rename, setWarning };
}