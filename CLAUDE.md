# CLAUDE.md

Guidance for working in this repository.

## What this is

**Tajmator** is a cross-platform desktop "mouse jiggler": it nudges the cursor
during a configurable schedule when the user has been idle, to keep a session
awake. It is built with **Electron + React + Jotai**.

The original implementation was a single `main.js` Node script using `robotjs`.
It is now a full Electron app; `robotjs` was replaced by the maintained
`@nut-tree-fork/nut-js` (robotjs is unmaintained and does not build on modern
Node/Electron).

## Tooling

- **Package manager:** pnpm via corepack. Version is pinned in `packageManager`
  (`package.json`). Run `corepack enable` once, then use `pnpm`.
- **Build:** `electron-vite` (bundles main/preload/renderer) + `electron-builder`
  (packages executables and publishes GitHub releases).
- **Module system:** the project is ESM (`"type": "module"`). Electron 42 runs
  the main process as ESM. `electron-store` is ESM-only; `nut-js` is CommonJS
  (imported via its default export).
- **Tests:** Vitest (jsdom). Test files live next to the code as `*.test.{js,jsx}`.

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Run the app in development (HMR renderer). |
| `pnpm build` | Build main/preload/renderer into `out/`. |
| `pnpm dist` | Build and package an executable into `release/`. |
| `pnpm test` | Run the unit tests once. |
| `pnpm icons` | Regenerate `build/icon.png` and `resources/tray.png`. |

## Layout (grouped by domain)

```
src/
  shared/            Constants/types shared across processes (settings, IPC).
  main/              Electron main process:
    settings/        Schema validation + persisted store.
    scheduler/       Pure decision logic (scheduler.logic) + interval runner.
    mouse/           nut-js cursor jiggle.
    window/          Main window lifecycle (close-to-tray).
    tray/            System tray icon + menu.
    ipc/             ipcMain handlers.
    index.js         Wires the modules and app lifecycle.
  preload/           contextBridge API exposed to the renderer.
  renderer/          React + Jotai UI:
    src/state/       Jotai atoms + sync hooks (bridge to preload).
    src/components/  Small, single-purpose components.
scripts/             Icon generator.
tests/               Vitest setup.
.github/workflows/   ci.yml (PR tests) and release.yml (version/tag/build).
```

## Settings model

`AppSettings` (see `src/shared/settings.constants.js`):

- `enabled` — manual on/off master switch.
- `startTime` / `endTime` — active window (`"HH:MM"`, supports overnight).
- `activeDays` — active weekdays (`0`=Sunday .. `6`=Saturday).
- `idleThresholdSeconds` — idle time before a jiggle.
- `checkIntervalSeconds` — how often the scheduler evaluates.

The scheduler jiggles only when `enabled && activeDay && withinWindow &&
idleEnough`. Idle time comes from `powerMonitor.getSystemIdleTime()`.

## Security / data handling

- `contextIsolation: true`, `nodeIntegration: false`; the renderer only sees the
  whitelisted `window.tajmator` API. The preload forwards payloads only (never
  the Electron event/sender object).
- All settings from IPC pass through `normalizeSettings`, which drops unknown
  keys and clamps values — the renderer cannot write arbitrary data to disk.
- The app makes **no network requests**; settings stay in the local
  `electron-store` JSON file. A strict CSP (`default-src 'self'`) is set in the
  renderer HTML.

## Release pipeline

Pushing to `main` triggers `release.yml`:

1. `version` job bumps the patch version (`npm version patch`), commits
   `chore(release): vX.Y.Z`, and pushes the commit + tag. The release commit is
   skipped by the job's own `if` guard to avoid a loop.
2. `build` job (matrix: Linux/macOS/Windows) checks out the tag, builds, and runs
   `electron-builder --publish always` to create the GitHub release and upload
   the AppImage / dmg / nsis executables. macOS builds are unsigned.

## Conventions

- Keep functions small (≤ ~15 lines) and shallow; prefer extracting helpers.
- Every function gets a JSDoc block with `@param` / `@returns`.
- Group code by domain (folders above), not by technical layer.
- Use Jotai for renderer state; keep components tiny and single-purpose.
- Add/keep unit tests in Vitest for pure logic and state.
- Update this file when something structurally important changes.
