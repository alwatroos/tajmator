/**
 * @typedef {Object} AppSettings
 * @property {boolean} enabled - Master manual on/off switch.
 * @property {string} startTime - Active window start as "HH:MM".
 * @property {string} endTime - Active window end as "HH:MM".
 * @property {number[]} activeDays - Active weekdays (0=Sunday .. 6=Saturday).
 * @property {number} idleThresholdSeconds - Idle seconds before jiggling.
 * @property {number} checkIntervalSeconds - Seconds between evaluations.
 */

/**
 * @typedef {Object} AppStatus
 * @property {boolean} enabled - Whether the jiggler is currently enabled.
 * @property {number} idleSeconds - Latest measured system idle time.
 * @property {boolean} jiggled - Whether the last tick moved the mouse.
 * @property {number} updatedAt - Epoch millis of the status update.
 */

/** Default application settings. @type {AppSettings} */
export const DEFAULT_SETTINGS = {
  enabled: false,
  startTime: '07:00',
  endTime: '17:00',
  activeDays: [1, 2, 3, 4, 5],
  idleThresholdSeconds: 60,
  checkIntervalSeconds: 15,
};

/** Bounds used to validate numeric settings. */
export const LIMITS = {
  idleThresholdSeconds: { min: 5, max: 3600 },
  checkIntervalSeconds: { min: 5, max: 600 },
};

/** Weekday descriptors ordered Monday-first for display. */
export const WEEKDAYS = [
  { value: 1, label: 'Pon' },
  { value: 2, label: 'Wt' },
  { value: 3, label: 'Śr' },
  { value: 4, label: 'Czw' },
  { value: 5, label: 'Pt' },
  { value: 6, label: 'Sob' },
  { value: 0, label: 'Nd' },
];
