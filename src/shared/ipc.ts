import type { AppState, Settings, UpdateSettingsResult } from './types.ts';

/** Name under which the preload script exposes the bridge on `window`. */
export const BRIDGE_KEY = 'tajmator';

export const IPC_CHANNELS = {
  getState: 'tajmator:get-state',
  updateSettings: 'tajmator:update-settings',
  stateChanged: 'tajmator:state-changed',
  openAccessibilitySettings: 'tajmator:open-accessibility-settings',
} as const;

/** API the renderer sees as `window.tajmator`. */
export interface TajmatorBridge {
  getState(): Promise<AppState>;
  updateSettings(patch: Partial<Settings>): Promise<UpdateSettingsResult>;
  onStateChanged(listener: (state: AppState) => void): () => void;
  openAccessibilitySettings(): Promise<void>;
}
