import type { Settings, SettingsErrors } from './types.ts';

export const DEFAULT_SETTINGS: Settings = {
  startTime: '07:00',
  endTime: '17:00',
  delayMinutes: 1,
  enabled: true,
};

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Parses a "HH:MM" 24h time.
 * @returns minutes since midnight, or null when the input is not a valid time.
 */
export function parseTime(hhmm: string): number | null {
  if (typeof hhmm !== 'string' || !TIME_PATTERN.test(hhmm)) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * Validates untrusted settings input (IPC payload or settings file content).
 * @returns the typed settings, or one error message per invalid field.
 */
export function validateSettings(
  input: unknown,
): { ok: true; settings: Settings } | { ok: false; errors: SettingsErrors } {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return {
      ok: false,
      errors: {
        startTime: 'Settings must be an object',
        endTime: 'Settings must be an object',
        delayMinutes: 'Settings must be an object',
        enabled: 'Settings must be an object',
      },
    };
  }
  const raw = input as Record<string, unknown>;
  const errors: SettingsErrors = {};

  const start = typeof raw.startTime === 'string' ? parseTime(raw.startTime) : null;
  const end = typeof raw.endTime === 'string' ? parseTime(raw.endTime) : null;
  if (start === null) errors.startTime = 'Start time must be HH:MM (00:00-23:59)';
  if (end === null) errors.endTime = 'End time must be HH:MM (00:00-23:59)';
  if (start !== null && end !== null && end <= start) {
    errors.endTime = 'End time must be after start time';
  }

  const delay = raw.delayMinutes;
  if (typeof delay !== 'number' || !Number.isInteger(delay) || delay < 1 || delay > 60) {
    errors.delayMinutes = 'Delay must be a whole number of minutes from 1 to 60';
  }
  if (typeof raw.enabled !== 'boolean') errors.enabled = 'Enabled must be true or false';

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    settings: {
      startTime: raw.startTime as string,
      endTime: raw.endTime as string,
      delayMinutes: delay as number,
      enabled: raw.enabled as boolean,
    },
  };
}
