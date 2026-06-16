/**
 * Convert a "HH:MM" string into minutes since midnight.
 * @param {string} time - Time in 24-hour "HH:MM" format.
 * @returns {number} Minutes since midnight (0-1439).
 */
export const timeToMinutes = (time) => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

/**
 * Get minutes since midnight for a given date.
 * @param {Date} date - The reference date.
 * @returns {number} Minutes since midnight.
 */
export const dateToMinutes = (date) => date.getHours() * 60 + date.getMinutes();

/**
 * Check whether the given date's weekday is enabled in settings.
 * @param {AppSettings} settings - Current settings.
 * @param {Date} now - Current date/time.
 * @returns {boolean} True when the weekday is active.
 */
export const isActiveDay = (settings, now) => settings.activeDays.includes(now.getDay());

/**
 * Check whether the time falls inside the configured window.
 * Windows spanning midnight (start > end) are supported.
 * @param {AppSettings} settings - Current settings.
 * @param {Date} now - Current date/time.
 * @returns {boolean} True when within the active window.
 */
export const isWithinWindow = (settings, now) => {
  const start = timeToMinutes(settings.startTime);
  const end = timeToMinutes(settings.endTime);
  const current = dateToMinutes(now);
  if (start <= end) return current >= start && current <= end;
  return current >= start || current <= end;
};

/**
 * Check whether idle time has reached the configured threshold.
 * @param {AppSettings} settings - Current settings.
 * @param {number} idleSeconds - Measured system idle seconds.
 * @returns {boolean} True when idle long enough.
 */
export const isIdleEnough = (settings, idleSeconds) => idleSeconds >= settings.idleThresholdSeconds;

/**
 * Decide whether the mouse should be jiggled right now.
 * @param {{settings: AppSettings, now: Date, idleSeconds: number}} params - Evaluation inputs.
 * @returns {boolean} True when all jiggle conditions are met.
 */
export const shouldJiggle = ({ settings, now, idleSeconds }) =>
  settings.enabled && isActiveDay(settings, now) && isWithinWindow(settings, now) && isIdleEnough(settings, idleSeconds);
