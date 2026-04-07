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

## 3) Первичная инициализация данных

При первом запуске приложение предлагает:
- создать новую workspace-папку, или
- выбрать уже существующую.

Важно: приложение создаёт только структуру папок (`blocks/`, `templates/`, `exports/`).
Содержимое блоков и рамки договора заполняется вручную (в редакторе).

## 4) Быстрая проверка проекта

```bash
npm run verify:setup
```

Команда проверяет:
- наличие ключевых файлов проекта,
- базовую совместимость версий Node/npm,
- отсутствие критичных пробелов в конфигурации.

## 5) Запуск dev-режима

```bash
npm run dev
```

Что должно произойти:
- стартует Vite на `http://localhost:5173`,
- откроется окно Electron,
- в окне виден текст про «Шаг 1».

## 6) Проверка сборки

```bash
npm run build
```

Ожидаемый результат:
- появятся папки `dist/` и `dist-electron/`,
- в `dist-electron/` присутствуют `main.js` и `preload.js`.

## 7) Проверка git remote (для синхронизации между двумя Mac)

```bash
git remote -v
```

Если `origin` не добавлен:

```bash
git remote add origin <PRIVATE_REPO_URL>
git push -u origin <branch-name>
```
