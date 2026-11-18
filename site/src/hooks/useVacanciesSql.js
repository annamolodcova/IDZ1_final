import { useCallback, useEffect, useRef, useState } from 'react';
import { getDatabase, getStorageWarning, initDatabase, saveDatabase } from '../lib/db.js';
import {
  getAllVacancies,
  insertVacancy,
  updateVacancy as updateVacancyQuery,
  deleteVacancy,
  bulkInsertVacancies,
  clearAllVacancies,
} from '../lib/queries.js';
import { createId } from '../lib/storage.js';
import { createSampleVacancies } from '../lib/sampleData.js';

/**
 * Вакансии текущего пользователя в SQLite.
 * При смене пользователя список перечитывается — профили не видят чужие записи.
 */
export function useVacanciesSql(userId) {
  const [vacancies, setVacancies] = useState([]);
  const [warning, setWarning] = useState(null);
  const [initializing, setInitializing] = useState(true);
  const dbRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setInitializing(true);
    setVacancies([]);

    if (!userId) {
      setInitializing(false);
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      try {
        await initDatabase();
        const db = getDatabase();
        if (cancelled) return;
        dbRef.current = db;
        setVacancies(getAllVacancies(db, userId));
        setWarning(getStorageWarning());
      } catch (error) {
        console.error('Не удалось прочитать вакансии:', error);
        if (!cancelled) setWarning('Не удалось открыть базу данных — данные не сохранятся.');
      } finally {
        if (!cancelled) setInitializing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const persist = useCallback(async () => {
    if (!dbRef.current) return;
    const result = await saveDatabase(dbRef.current);
    setWarning(result.ok ? null : result.warning);
  }, []);

  const addVacancy = useCallback(
    (input) => {
      const now = new Date().toISOString();
      const vacancy = { ...input, id: createId(), createdAt: now, updatedAt: now };
      if (!dbRef.current || !userId) return vacancy;
      insertVacancy(dbRef.current, userId, vacancy);
      setVacancies(getAllVacancies(dbRef.current, userId));
      persist();
      return vacancy;
    },
    [persist, userId],
  );

  const updateVacancy = useCallback(
    (id, input) => {
      if (!dbRef.current || !userId) return;
      updateVacancyQuery(dbRef.current, userId, id, input);
      setVacancies(getAllVacancies(dbRef.current, userId));
      persist();
    },
    [persist, userId],
  );

  const removeVacancy = useCallback(
    (id) => {
      if (!dbRef.current || !userId) return;
      deleteVacancy(dbRef.current, userId, id);
      setVacancies(getAllVacancies(dbRef.current, userId));
      persist();
    },
    [persist, userId],
  );

  // Восстановление удалённой записи для «Отменить удаление».
  const restoreVacancy = useCallback(
    (vacancy) => {
      if (!dbRef.current || !userId || !vacancy) return;
      insertVacancy(dbRef.current, userId, vacancy);
      setVacancies(getAllVacancies(dbRef.current, userId));
      persist();
    },
    [persist, userId],
  );

  // Полная замена списка при импорте JSON.
  const importVacancies = useCallback(
    (list) => {
      if (!dbRef.current || !userId || !Array.isArray(list)) return;
      clearAllVacancies(dbRef.current, userId);
      bulkInsertVacancies(dbRef.current, userId, list);
      setVacancies(getAllVacancies(dbRef.current, userId));
      persist();
    },
    [persist, userId],
  );

  const loadSamples = useCallback(() => {
    if (!dbRef.current || !userId) return;
    if (getAllVacancies(dbRef.current, userId).length > 0) return;
    bulkInsertVacancies(dbRef.current, userId, createSampleVacancies());
    setVacancies(getAllVacancies(dbRef.current, userId));
    persist();
  }, [persist, userId]);

  return {
    vacancies,
    warning,
    initializing,
    addVacancy,
    updateVacancy,
    removeVacancy,
    restoreVacancy,
    importVacancies,
    loadSamples,
  };
}
