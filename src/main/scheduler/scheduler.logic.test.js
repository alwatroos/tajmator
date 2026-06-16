import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../shared/settings.constants.js';
import {
  dateToMinutes,
  isActiveDay,
  isIdleEnough,
  isWithinWindow,
  shouldJiggle,
  timeToMinutes,
} from './scheduler.logic.js';

/**
 * Build a date for a fixed weekday at a given time.
 * @param {number} day - Weekday (0=Sun..6=Sat); 2026-06-15 is a Monday.
 * @param {number} hour - Hour of day.
 * @param {number} [minute] - Minute of hour.
 * @returns {Date} The constructed date.
 */
const at = (day, hour, minute = 0) => new Date(2026, 5, 14 + day, hour, minute);

describe('time helpers', () => {
  it('converts "HH:MM" to minutes', () => {
    expect(timeToMinutes('07:30')).toBe(450);
  });

  it('reads minutes from a date', () => {
    expect(dateToMinutes(at(1, 9, 15))).toBe(555);
  });
});

describe('isWithinWindow', () => {
  it('includes times inside a normal window', () => {
    expect(isWithinWindow(DEFAULT_SETTINGS, at(1, 9))).toBe(true);
  });

  it('excludes times outside a normal window', () => {
    expect(isWithinWindow(DEFAULT_SETTINGS, at(1, 18))).toBe(false);
  });

  it('supports windows spanning midnight', () => {
    const overnight = { ...DEFAULT_SETTINGS, startTime: '22:00', endTime: '06:00' };
    expect(isWithinWindow(overnight, at(1, 23))).toBe(true);
    expect(isWithinWindow(overnight, at(1, 12))).toBe(false);
  });
});

describe('isActiveDay', () => {
  it('matches configured weekdays', () => {
    expect(isActiveDay(DEFAULT_SETTINGS, at(1, 9))).toBe(true);
    expect(isActiveDay(DEFAULT_SETTINGS, at(0, 9))).toBe(false);
  });
});

describe('isIdleEnough', () => {
  it('compares against the threshold', () => {
    expect(isIdleEnough(DEFAULT_SETTINGS, 60)).toBe(true);
    expect(isIdleEnough(DEFAULT_SETTINGS, 30)).toBe(false);
  });
});

describe('shouldJiggle', () => {
  const enabled = { ...DEFAULT_SETTINGS, enabled: true };

  it('is true when every condition is met', () => {
    expect(shouldJiggle({ settings: enabled, now: at(1, 9), idleSeconds: 120 })).toBe(true);
  });

  it('is false when disabled', () => {
    expect(shouldJiggle({ settings: DEFAULT_SETTINGS, now: at(1, 9), idleSeconds: 120 })).toBe(false);
  });

  it('is false when not idle enough', () => {
    expect(shouldJiggle({ settings: enabled, now: at(1, 9), idleSeconds: 10 })).toBe(false);
  });

  it('is false outside the active window', () => {
    expect(shouldJiggle({ settings: enabled, now: at(1, 20), idleSeconds: 120 })).toBe(false);
  });
});
