# App Icons

Place icon files here before running `npm run dist`:

| File        | Size        | Platform |
|-------------|-------------|----------|
| icon.icns   | —           | macOS    |
| icon.ico    | —           | Windows  |
| icon.png    | 1024×1024px | Linux / fallback |

## Generating from a single PNG

If you have a 1024×1024 `icon.png`, electron-builder can auto-generate
`.icns` and `.ico` — just place `icon.png` here and run:

    npm run dist:mac   # needs macOS + Xcode iconutil
    npm run dist:win   # needs wine on non-Windows
