# Tajmator

A macOS menu bar app that keeps the mouse moving during working hours. If the cursor has not moved
since the last check, Tajmator nudges it by 5 px, alternating direction. Outside the working window,
or when disabled, it never touches the cursor.

## Requirements

- macOS
- Node.js as pinned in `.nvmrc` (24.x)
- corepack (ships with Node) for the pinned pnpm version

## Install and run

```sh
corepack enable && pnpm install
pnpm dev      # build and start the app from source
pnpm check    # biome, typecheck and tests
pnpm icons    # regenerate icons and tray images (needs Google Chrome)
```

## Settings

Open the settings window from the tray menu (it also opens at launch). Closing it hides it; the app
keeps running in the tray. Settings are stored as JSON in the app's `userData` folder.

| Setting    | Default    | Rule                                                               |
| ---------- | ---------- | ------------------------------------------------------------------ |
| Start time | `07:00`    | `HH:MM`, 24h local time                                            |
| End time   | `17:00`    | `HH:MM`, must be after the start time (no windows across midnight) |
| Delay      | `1` minute | whole number, 1 to 60. How often the cursor is checked             |
| Enabled    | on         | when off, the app only reports `Sleeping`                          |

The working window is `[start, end)`: the start is included, the end is not.

## Status colours

| Status | Colour          | Meaning                                     |
| ------ | --------------- | ------------------------------------------- |
| Active | green `#22c55e` | the cursor moved since the last check       |
| Idle   | amber `#f59e0b` | the cursor did not move, Tajmator nudged it |
| Sleep  | grey `#9ca3af`  | outside the working window, or disabled     |

## Early start

If you are already working before the start time, the window opens early. When the cursor shows
sustained activity (at least 10 minutes) within the 120 minutes before the start time, that day's
window starts at the first active moment. The end time never changes, and the early start resets
the next day.

## Accessibility permission

Moving the cursor needs the macOS Accessibility permission. Tajmator asks once at startup. Without
it the status still follows the rules, but the cursor is not moved, and the settings window and tray
menu show a "Grant Accessibility permission" action that opens System Settings, Privacy & Security,
Accessibility. When running from source with `pnpm dev`, grant it to Electron or to the terminal
you started it from.

## Packaging note

The app loads tray and dock icons from `assets/` at runtime, so the packaging config must include
`assets/` next to the app code.

## Releases and updates
