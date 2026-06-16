import { DEFAULT_SETTINGS, LIMITS } from '../../shared/settings.constants.js';

/** Matches a 24-hour "HH:MM" time string. */
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Clamp a value to an integer within [min, max], falling back if invalid.
 * @param {unknown} value - Raw value to coerce.
 * @param {{min: number, max: number}} range - Allowed inclusive range.
 * @param {number} fallback - Value used when input is not finite.
 * @returns {number} The clamped integer.
 */
const clampInt = (value, range, fallback) => {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, range.min), range.max);
};

/**
 * Sanitize a list of weekdays to unique integers within 0-6.
 * @param {unknown} days - Raw weekday list.
 * @returns {number[]} Sorted, de-duplicated valid weekdays.
 */
const sanitizeDays = (days) => {
  if (!Array.isArray(days)) return [...DEFAULT_SETTINGS.activeDays];
  const valid = [...new Set(days.map(Number))].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  return valid.sort((a, b) => a - b);
};

/**
 * Validate a time string, falling back when malformed.
 * @param {unknown} time - Raw time value.
 * @param {string} fallback - Default time to use on failure.
 * @returns {string} A valid "HH:MM" string.
 */
const sanitizeTime = (time, fallback) => (typeof time === 'string' && TIME_PATTERN.test(time) ? time : fallback);

/**
 * Normalize arbitrary/untrusted input into a complete, valid settings object.
 * @param {Partial<AppSettings>} [input] - Raw settings from disk or IPC.
 * @returns {AppSettings} Fully populated, validated settings.
 */
export const normalizeSettings = (input = {}) => ({
  enabled: Boolean(input.enabled),
  startTime: sanitizeTime(input.startTime, DEFAULT_SETTINGS.startTime),
  endTime: sanitizeTime(input.endTime, DEFAULT_SETTINGS.endTime),
  activeDays: sanitizeDays(input.activeDays),
  idleThresholdSeconds: clampInt(input.idleThresholdSeconds, LIMITS.idleThresholdSeconds, DEFAULT_SETTINGS.idleThresholdSeconds),
  checkIntervalSeconds: clampInt(input.checkIntervalSeconds, LIMITS.checkIntervalSeconds, DEFAULT_SETTINGS.checkIntervalSeconds),
});
