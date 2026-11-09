/** Engine status shown in the tray and the settings window. */
export type Status = 'active' | 'idle' | 'sleep';

/** User settings. Times are "HH:MM" in 24h local time. */
export interface Settings {
  startTime: string;
  endTime: string;
  delayMinutes: number;
  enabled: boolean;
}

/** Full app state pushed from main to the renderer. Dates are ISO strings. */
export interface AppState {
  settings: Settings;
  status: Status;
  idleMinutes: number;
  earlyStartAt: string | null;
  accessibilityGranted: boolean;
  lastTickAt: string | null;
}

export type SettingsErrors = Partial<Record<keyof Settings, string>>;

export type UpdateSettingsResult =
  | { ok: true; state: AppState }
  | { ok: false; errors: SettingsErrors; saveError?: string };

export const STATUS_COLORS: Record<Status, string> = {
  active: '#22c55e',
  idle: '#f59e0b',
  sleep: '#9ca3af',
};
