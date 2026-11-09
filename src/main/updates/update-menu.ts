import type { MenuItemConstructorOptions } from 'electron';
import type { UpdateStatus } from '../../shared/updates.ts';

/** What the tray menu items trigger. */
export interface UpdateMenuActions {
  check(): void;
  download(): void;
  install(): void;
}

/** The disabled status line for a phase. */
export function updateStatusLabel(status: UpdateStatus): string {
  const version = status.release?.version ?? '';
  switch (status.phase) {
    case 'checking':
      return 'Checking for updates…';
    case 'up_to_date':
      return `Up to date · ${status.currentVersion}`;
    case 'available':
      return `Update ${version} available`;
    case 'unverifiable':
      return `Update ${version} cannot be verified`;
    case 'downloading': {
      const d = status.download;
      const pct = d && d.totalBytes > 0 ? Math.floor((d.bytes / d.totalBytes) * 100) : 0;
      return `Downloading ${version}… ${pct}%`;
    }
    case 'verified':
      return `Update ${version} ready to install`;
    case 'installing':
      return `Installing ${version}…`;
    case 'failed':
      return 'Update failed';
    default:
      return `Version ${status.currentVersion}`;
  }
}

/**
 * Builds the updater's tray menu section: a status line, "Check for Updates", then the
 * download or install item the phase allows.
 */
export function buildUpdateMenuSection(
  status: UpdateStatus,
  actions: UpdateMenuActions,
): MenuItemConstructorOptions[] {
  const busy =
    status.phase === 'checking' || status.phase === 'downloading' || status.phase === 'installing';
  const items: MenuItemConstructorOptions[] = [
    { label: updateStatusLabel(status), enabled: false },
    { label: 'Check for Updates', enabled: !busy, click: () => actions.check() },
  ];
  const version = status.release?.version ?? '';
  if (status.phase === 'available') {
    items.push({ label: `Download Update ${version}`, click: () => actions.download() });
  }
  if (status.phase === 'verified') {
    items.push({
      label: `Install Update ${version} and Restart…`,
      click: () => actions.install(),
    });
  }
  return items;
}
