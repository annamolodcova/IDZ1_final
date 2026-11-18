# Архитектура проекта «Карьерный дневник» (ARCHITECTURE.md)

Документ описывает техническое устройство приложения, схему и связи данных, жизненный цикл пользовательских действий, уровни хранения и зафиксированные ограничения реализации в соответствии с требованиями итоговой сдачи ИДЗ № 1.

---

## 1. Общее устройство системы

Приложение представляет собой локальное одностраничное веб-приложение (Single Page Application, SPA) без внешнего бэкенда и облачной базы данных. Все вычисления, рендеринг, хранение и управление состоянием выполняются непосредственно в браузере пользователя.

```mermaid
flowchart TD
    subgraph UI ["Пользовательский интерфейс (React 19 + JSX)"]
        AuthScreen["Экран входа / Регистрации"]
        MainScreen["Основной экран (Шапка, Тулбар, Сводка)"]
        VacancyCards["Список вакансий / Сетка карточек"]
        CalendarView["Календарь-теплокарта (26 недель)"]
        Modals["Модальные окна (Форма, Настройки, Поиск в каталоге)"]
    end

    subgraph StateHooks ["Слой хуков и реактивного состояния"]
        useAuth["useAuth (сессия, профиль, вход/выход)"]
        useVacanciesSql["useVacanciesSql (CRUD, фильтрация, сортировка)"]
    end

    subgraph LogicLayer ["Модули бизнес-логики (src/lib)"]
        Queries["queries.js (SQL-запросы)"]
        DatesLib["dates.js (расчет дедлайнов и бейджей)"]
        HeatmapLib["heatmap.js (матрица недель и срочности)"]
        JobsApi["jobsApi.js & hhApi.js (внешние каталоги без ключей)"]
        ExportImport["exportImport.js (JSON backup/restore)"]
        PasswordLib["password.js (Web Crypto PBKDF2 / SHA-256)"]
    end

    subgraph StorageLayer ["Слой персистентности данных (db.js / storage.js)"]
        SqlJs["SQLite WASM (sql.js v1.16)"]
        LocalFile["Локальный файл SQLite — career-diary.sqlite (в папке проекта)"]
        OPFS["OPFS (Origin Private File System)"]
        IDB["IndexedDB fallback"]
        MemFallback["In-Memory fallback (с предупреждением)"]
        SessionStore["localStorage (career-diary.session.v1)"]
    end

    UI --> StateHooks
    StateHooks --> LogicLayer
    LogicLayer --> StorageLayer
    SqlJs --> LocalFile
    LocalFile --> OPFS
    OPFS -.->|если недоступен| IDB
    IDB -.->|если недоступен| MemFallback
    useAuth --> SessionStore
```

---

## 2. Сущности, поля и связи данных

Данные хранятся в реляционной базе данных SQLite (движок WebAssembly `sql.js`). Схема поддерживает строгую ссылочную целостность (`FOREIGN KEY ... ON DELETE CASCADE`), индексы для быстрой фильтрации и версионирование через `PRAGMA user_version = 2`.

```mermaid
erDiagram
    USERS ||--o{ VACANCIES : "owns (1 к N)"

    USERS {
        TEXT id PK "UUID профиля"
        TEXT name "Имя пользователя"
        TEXT email UK "Уникальный email (COLLATE NOCASE)"
        TEXT password_hash "SHA-256 хеш с солью (1000 итераций)"
        TEXT password_salt "Уникальная криптографическая соль (hex)"
        TEXT created_at "ISO 8601 дата регистрации (UTC)"
    }

    VACANCIES {
        TEXT id PK "UUID записи вакансии"
        TEXT user_id FK "Ссылка на users(id) ON DELETE CASCADE"
        TEXT company "Название компании (обязательное)"
        TEXT position "Должность / направление (обязательное)"
        TEXT status "applied | screening | test | interview | offer | rejected"
        TEXT test_deadline "YYYY-MM-DD (локальная календарная дата дедлайна)"
        TEXT next_interview_at "YYYY-MM-DD (локальная календарная дата собеседования)"
        TEXT link "URL вакансии или первоисточника"
        TEXT notes "Текстовые заметки, описание, условия"
        TEXT created_at "ISO 8601 дата создания записи"
        TEXT updated_at "ISO 8601 дата последнего изменения"
    }
```

### Назначение полей и обоснование решений:
1. **Изоляция данных (`user_id`):** каждый профиль видит только свои вакансии. Все выборки `SELECT`, добавления `INSERT`, обновления и подсчеты счетчиков фильтруются по `WHERE user_id = ?`.
2. **Даты в формате `YYYY-MM-DD`:** локальная календарная дата без временной компоненты и часовых поясов. Гарантирует, что перевод часов или сдвиг часового пояса не смещает дедлайн. Лексикографический порядок строк `YYYY-MM-DD` строго совпадает с хронологическим, что позволяет эффективно использовать стандартные операторы `<, <=, >, BETWEEN` и B-Tree индексы SQLite.
3. **Безопасность паролей:** пароли не сохраняются в открытом виде. Используется связка уникальной соли (16 байт криптографически стойких псевдослучайных чисел через `crypto.getRandomValues`) и итеративного хеширования SHA-256. Внешние auth-сервисы не задействуются, что полностью соответствует критериям прототипа авторизации.

---

## 3. Схема жизненного цикла: от действия пользователя до сохранения

Диаграмма иллюстрирует сквозной путь данных при основном действии: пользователь заполняет форму создания или редактирования вакансии и нажимает «Сохранить».

```mermaid
sequenceDiagram
    autonumber
    actor User as Пользователь
    participant Form as VacancyFormModal (UI)
    participant Hook as useVacanciesSql (React Hook)
    participant Queries as queries.js (SQL Layer)
    participant DB as db.js (SQLite WASM)
    participant Storage as storage.js (OPFS / File System)
    participant UI as Diary / VacancyCard (UI)

    User->>Form: Заполняет поля (компания, должность, статус, дедлайны)
    User->>Form: Нажимает «Сохранить»
    Form->>Form: Валидация (trim, проверка обязательных полей, формат URL)
    alt Валидация не прошла
        Form-->>User: Отображение ошибок под невалидными полями, блокировка отправки
    else Валидация успешна
        Form->>Hook: addVacancy(data) или updateVacancy(id, data)
        Hook->>Queries: insertVacancy(db, userId, payload) / updateVacancy(...)
        Queries->>DB: db.run("INSERT INTO vacancies ...", [id, userId, ...])
        DB-->>Queries: Запрос успешно выполнен
        Hook->>DB: exportDatabase() -> Uint8Array
        DB->>Storage: POST /api/db -> запись в career-diary.sqlite на диске
        DB->>Storage: saveDatabaseFile(bytes) в OPFS (браузерный кэш)
        Storage-->>DB: Файл записан на диск проекта и в браузер
        Hook->>Queries: getVacanciesByUserId(db, userId)
        Queries-->>Hook: Свежий массив вакансий
        Hook-->>UI: Обновление состояния (setVacancies)
        Form-->>User: Закрытие модального окна, возврат фокуса на кнопку-источник
        UI-->>User: Всплывающее уведомление «Вакансия добавлена», подсветка карточки
    end
```

---

## 4. Уровни хранения данных и устойчивость

Приложение использует многоуровневую стратегию надежного сохранения базы данных SQLite:

1. **Основной локальный уровень — файл `career-diary.sqlite` в папке проекта:**
   - Файл базы данных SQLite физически сохраняется прямо на диск в корень проекта и папку `site/` через встроенный серверный эндпоинт `/api/db`.
   - Данные можно в любой момент проинспектировать через системный терминал: `sqlite3 career-diary.sqlite "SELECT * FROM users;"`.
   - Пользователи и вакансии сохраняются на диске компьютера и переживают перезапуск dev-сервера, перезагрузку страницы (F5) и перезапуск браузера.
2. **Браузерный уровень — OPFS (Origin Private File System):**
   - Бинарный дамп базы параллельно сохраняется в постоянную файловую систему браузера для независимой оффлайн-работы.
3. **Резервный уровень — IndexedDB:**
   - Если браузер или окружение не поддерживает OPFS (например, приватный режим некоторых браузеров), бинарный дамп автоматически сохраняется как Blob в хранилище IndexedDB `career-diary-db`.
4. **Аварийный уровень — In-Memory:**
   - Если доступ к дисковым API полностью заблокирован, база инициализируется в оперативной памяти WASM с отображением предупреждающего баннера.
5. **Резервное копирование — Экспорт/Импорт JSON:**
   - В окне настроек профиля реализована возможность выгрузки полного JSON-дампа текущего профиля для переноса между разными браузерами или компьютерами.

---

## 5. Внешние интеграции и ограничения реализации

1. **Каталог вакансий «Работа России» (Trudvsem):**
   - Используются открытые государственные данные (`opendata.trudvsem.ru/api/v1/vacancies`).
   - Ключ API не требуется. CORS открыт.
   - Ограничение: сервис может отвечать до 5–10 секунд. В приложении установлен таймаут 20 секунд и кэширование на 10 минут.
2. **Каталог вакансий Remotive:**
   - Публичный API удаленных вакансий (`remotive.com/api/remote-jobs`).
   - Ключ API не требуется. CORS открыт. Время ответа ~0.5 секунды.
3. **Автозаполнение по ссылке hh.ru:**
   - Публичный API (`api.hh.ru/vacancies/{id}`).
   - Ограничение: у hh.ru авторизованные методы доступны только работодателям, а публичные запросы блокируются DDoS-Guard (`403 Forbidden`) в большинстве сетей без корпоративной подписки. В коде предусмотрена корректная обработка ошибки без падения формы, а основной упор сделан на каталоги Trudvsem и Remotive.

---

## 6. Задел на будущее развитие схемы (Roadmap)

В файле `site/src/lib/schema.sql` заложены закомментированные структуры для развития проекта в ИДЗ № 2:
- `stage_history`: таблица для отслеживания дат и заметок по каждому этапу отбора (скрининг -> интервью -> оффер).
- `tags` и `vacancy_tags`: многоколончатая категоризация по стеку (Frontend, Python, QA) и грейдам.
- `attachments`: прикрепление локальных файлов резюме и тестовых заданий.
