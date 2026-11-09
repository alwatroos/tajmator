import { join } from 'node:path';
import type { MenuItemConstructorOptions } from 'electron';
import { Menu, nativeImage, Tray } from 'electron';
import type { AppState, Status } from '../shared/types.ts';

export interface TrayActions {
  setEnabled(enabled: boolean): void;
  openWindow(): void;
  grantAccessibility(): void;
  quit(): void;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function statusLabel(state: AppState): string {
  let label = 'Sleeping';
  if (state.status === 'active') label = 'Active';
  else if (state.status === 'idle') label = `Idle · ${state.idleMinutes} min`;
  if (state.earlyStartAt) label += ` · started early ${formatTime(state.earlyStartAt)}`;
  return label;
}

/**
 * Builds the tray menu. `extraSections` are inserted before the final separator and Quit
 * (hook for the updater).
 */
export function buildTrayMenuTemplate(
  state: AppState,
  actions: TrayActions,
  extraSections: MenuItemConstructorOptions[][] = [],
): MenuItemConstructorOptions[] {
  const items: MenuItemConstructorOptions[] = [
    { label: statusLabel(state), enabled: false },
    { type: 'separator' },
    {
      label: 'Enabled',
      type: 'checkbox',
      checked: state.settings.enabled,
      click: (item) => actions.setEnabled(item.checked),
    },
    { label: 'Open Tajmator…', click: () => actions.openWindow() },
  ];
  if (!state.accessibilityGranted) {
    items.push({
      label: 'Grant Accessibility permission…',
      click: () => actions.grantAccessibility(),
    });
  }
  for (const section of extraSections) {
    items.push({ type: 'separator' }, ...section);
  }
  items.push({ type: 'separator' }, { label: 'Quit', click: () => actions.quit() });
  return items;
}

/** @returns the 1x tray icon path for a status (the `@2x` file sits next to it). */
export function trayIconPath(status: Status, assetsDir: string): string {
  return join(assetsDir, 'tray', `tray-${status}.png`);
}

export interface CreateTrayDeps {
  assetsDir: string;
  getState: () => AppState;
  onChange: (listener: (state: AppState) => void) => () => void;
  actions: TrayActions;
  /** Extra menu sections, read on every rebuild. */
  getExtraSections?: () => MenuItemConstructorOptions[][];
}

/** Creates the tray icon and keeps its icon, tooltip and menu in sync with the state. */
export function createTray(deps: CreateTrayDeps): { tray: Tray; refresh: () => void } {
  const tray = new Tray(
    nativeImage.createFromPath(trayIconPath(deps.getState().status, deps.assetsDir)),
  );
  const render = (state: AppState): void => {
    tray.setImage(nativeImage.createFromPath(trayIconPath(state.status, deps.assetsDir)));
    tray.setToolTip(`Tajmator: ${statusLabel(state)}`);
    tray.setContextMenu(
      Menu.buildFromTemplate(
        buildTrayMenuTemplate(state, deps.actions, deps.getExtraSections?.() ?? []),
      ),
    );
  };
  render(deps.getState());
  deps.onChange(render);
  return { tray, refresh: () => render(deps.getState()) };
}
