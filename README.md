# License Builder (Electron + React + TypeScript + Vite)

Минимальный старт проекта для macOS desktop-приложения конструктора лицензий.

## 1) Проверка окружения (на вашем Mac)

```bash
node -v
npm -v
```

Рекомендуемо:
- Node.js 20+
- npm 10+

## 2) Установка зависимостей

```bash
npm install
```

Если видите ошибки сети/registry (403/407/timeout):
- проверьте VPN/корпоративный proxy,
- выполните `npm config get registry` (должно быть `https://registry.npmjs.org/`),
- при необходимости очистите кэш: `npm cache clean --force`.


### Частое предупреждение npm

Если при `npm install` видите сообщение:

`npm warn deprecated boolean@3.2.0: Package no longer supported...`

это **не конфликт** и обычно не блокирует установку/запуск. Это предупреждение о транзитивной зависимости одного из пакетов Electron-стека. Пока установка завершается успешно и `npm run dev` работает — можно продолжать.


## 3) Быстрая проверка проекта

```bash
npm run verify:setup
```

Команда проверяет:
- наличие ключевых файлов проекта,
- базовую совместимость версий Node/npm,
- отсутствие критичных пробелов в конфигурации.

## 4) Запуск dev-режима

```bash
npm run dev
```

Что должно произойти:
- стартует Vite на `http://localhost:5173`,
- откроется окно Electron,
- откроется рабочий интерфейс конструктора.

## 5) Проверка сборки

```bash
npm run build
```

Ожидаемый результат:
- появятся папки `dist/` и `dist-electron/`,
- в `dist-electron/` присутствуют `main.js`, `preload.js` и `package.json`.

## 6) Проверка git remote (для синхронизации между двумя Mac)

```bash
git remote -v
```

Если `origin` не добавлен:

```bash
git remote add origin <PRIVATE_REPO_URL>
git push -u origin <branch-name>
```

## Локальная компиляция и сборка (готовые команды)

```bash
# 1) Чистая установка зависимостей
npm ci

# 2) Проверка окружения/структуры
npm run verify:setup

# 3) Проверка типов
npm run typecheck

# 4) Сборка renderer + electron
npm run build

# 5) Пакет приложения для macOS
npm run dist:mac
```

Артефакты:
- web/electron build: `dist/`, `dist-electron/`
- инсталляторы и образы: `release/`


## Быстрый запуск на macOS (пошагово)

1. Откройте Terminal и перейдите в проект:

```bash
cd /path/to/licensebuilder
```

2. Проверьте версии:

```bash
node -v
npm -v
```

3. Установите зависимости:

```bash
npm install
```

4. Проверьте базовую целостность проекта:

```bash
npm run verify:setup
```

5. Запустите приложение в режиме разработки:

```bash
npm run dev
```

Ожидание:
- откроется окно Electron;
- проверьте, что можно создавать/сохранять документ;
- в `Настройки...` кнопка «Выбрать...» открывает нативный диалог папок macOS и сохраняет путь рабочей папки.

6. Остановите dev-режим: `Ctrl + C`.

7. Проверьте production-сборку:

```bash
npm run build
```

После успешной сборки должны появиться:
- `dist/`
- `dist-electron/`.



## Для новичка: что нажимать по шагам

Да, нужно **скачать проект** и выполнить несколько команд в Терминале.

### Вариант A — через GitHub Desktop (самый простой)
1. Установите **GitHub Desktop**.
2. Нажмите `File` → `Clone repository`.
3. Выберите ваш приватный репозиторий и папку для скачивания.
4. Нажмите `Clone`.
5. Откройте `Repository` → `Open in Terminal`.

### Вариант B — через обычный Terminal
1. Откройте приложение **Terminal** на Mac.
2. Выполните:

```bash
git clone <URL_ВАШЕГО_РЕПО>
cd licensebuilder
```

### Что вводить дальше в терминале

```bash
npm install
npm run verify:setup
npm run dev
```

После `npm run dev` откроется окно приложения.

### Если окно не открылось
- Проверьте, что вы находитесь в папке проекта (`pwd`).
- Повторите `npm install`.
- Убедитесь, что Node.js установлен (`node -v`).



## Можно ли через «эмулятор»?

Да — можно смотреть интерфейс без Electron в обычном браузере.

```bash
npm run dev:web
```

Это откроет Vite-страницу (обычно `http://localhost:5173`) и позволит проверить верстку/поведение формы.

Важно:
- в этом режиме **нет доступа к файловой системе macOS**;
- это только UI-предпросмотр;
- реальную проверку выбора папки и IPC нужно делать через `npm run dev` (Electron).



## Vercel: что вы видите и почему

Ваш скрин из Vercel показывает **веб-версию** приложения (не Electron). Это нормально: Vercel не запускает desktop-окно Electron, он деплоит только фронтенд.

Если на Vercel видите старый экран «Шаг 1...», обычно причина одна из двух:
1. Деплоится не та ветка/не тот последний commit.
2. В проекте Vercel указан неправильный build command.

Рекомендованные настройки Vercel для этого репозитория:
- Build Command: `npm run build:web`
- Output Directory: `dist`

После этого Vercel будет показывать актуальный UI-preview из `src/App.tsx`, но без нативных функций Electron (выбор папок через macOS диалог и т.д.).



## Полезно

- Как передать реальные `.docx` без вложений: `docs/how-to-share-docx.md`.
