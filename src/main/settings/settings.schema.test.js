import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../shared/settings.constants.js';
import { normalizeSettings } from './settings.schema.js';

describe('normalizeSettings', () => {
  it('returns defaults for empty input', () => {
    expect(normalizeSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('coerces enabled to a boolean', () => {
    expect(normalizeSettings({ enabled: 'yes' }).enabled).toBe(true);
  });

  it('rejects malformed time strings', () => {
    expect(normalizeSettings({ startTime: '99:99' }).startTime).toBe(DEFAULT_SETTINGS.startTime);
  });

  it('keeps valid time strings', () => {
    expect(normalizeSettings({ startTime: '06:15' }).startTime).toBe('06:15');
  });

  it('de-duplicates, sorts and filters weekdays', () => {
    expect(normalizeSettings({ activeDays: [3, 3, 9, -1, 0] }).activeDays).toEqual([0, 3]);
  });

  it('clamps the idle threshold into range', () => {
    expect(normalizeSettings({ idleThresholdSeconds: 99999 }).idleThresholdSeconds).toBe(3600);
    expect(normalizeSettings({ idleThresholdSeconds: 1 }).idleThresholdSeconds).toBe(5);
  });

  it('drops unknown keys (no data leak into the store)', () => {
    expect(normalizeSettings({ secret: 'x' })).not.toHaveProperty('secret');
  });
});
