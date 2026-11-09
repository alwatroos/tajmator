import type { AppState, Settings, UpdateSettingsResult } from './types.ts';
import type { InstallUpdateResult, UpdateStatus } from './updates.ts';

/** Name under which the preload script exposes the bridge on `window`. */
export const BRIDGE_KEY = 'tajmator';

export const IPC_CHANNELS = {
  getState: 'tajmator:get-state',
  updateSettings: 'tajmator:update-settings',
  stateChanged: 'tajmator:state-changed',
  openAccessibilitySettings: 'tajmator:open-accessibility-settings',
  getUpdateStatus: 'tajmator:get-update-status',
  checkForUpdates: 'tajmator:check-for-updates',
  downloadUpdate: 'tajmator:download-update',
  installUpdate: 'tajmator:install-update',
  updateStatusChanged: 'tajmator:update-status-changed',
} as const;

/** API the renderer sees as `window.tajmator`. */
export interface TajmatorBridge {
  getState(): Promise<AppState>;
  updateSettings(patch: Partial<Settings>): Promise<UpdateSettingsResult>;
  onStateChanged(listener: (state: AppState) => void): () => void;
  openAccessibilitySettings(): Promise<void>;
  getUpdateStatus(): Promise<UpdateStatus>;
  checkForUpdates(): Promise<UpdateStatus>;
  downloadUpdate(): Promise<UpdateStatus>;
  installUpdate(): Promise<InstallUpdateResult>;
  onUpdateStatusChanged(listener: (status: UpdateStatus) => void): () => void;
}
