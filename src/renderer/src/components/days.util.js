/**
 * Toggle a weekday's membership in the active-days list.
 * @param {number[]} days - Current active weekdays.
 * @param {number} day - Weekday value to toggle (0-6).
 * @returns {number[]} A new list with the day added or removed.
 */
export const toggleDay = (days, day) =>
  days.includes(day) ? days.filter((d) => d !== day) : [...days, day];
