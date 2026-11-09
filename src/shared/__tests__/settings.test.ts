import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, parseTime, validateSettings } from '../settings.ts';

describe('parseTime', () => {
  it('parses valid times', () => {
    expect(parseTime('00:00')).toBe(0);
    expect(parseTime('07:30')).toBe(450);
    expect(parseTime('23:59')).toBe(1439);
  });

  it('rejects malformed times', () => {
    for (const bad of ['', '7:00', '24:00', '12:60', '12:5', 'ab:cd', '12:00:00']) {
      expect(parseTime(bad)).toBeNull();
    }
  });
});

describe('validateSettings', () => {
  it('accepts the defaults', () => {
    expect(validateSettings(DEFAULT_SETTINGS)).toEqual({ ok: true, settings: DEFAULT_SETTINGS });
  });

  it('accepts valid custom input', () => {
    const input = { startTime: '09:15', endTime: '18:45', delayMinutes: 60, enabled: false };
    expect(validateSettings(input)).toEqual({ ok: true, settings: input });
  });

  it('rejects a bad startTime', () => {
    const r = validateSettings({ ...DEFAULT_SETTINGS, startTime: '25:00' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors)).toEqual(['startTime']);
  });

  it('rejects a bad endTime', () => {
    const r = validateSettings({ ...DEFAULT_SETTINGS, endTime: 'noon' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors)).toEqual(['endTime']);
  });

  it('rejects endTime equal to or before startTime', () => {
    for (const endTime of ['07:00', '06:59']) {
      const r = validateSettings({ ...DEFAULT_SETTINGS, endTime });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.endTime).toMatch(/after/);
    }
  });

  it('rejects an invalid delayMinutes', () => {
    for (const delayMinutes of [0, 61, 1.5, -1, '5', null, Number.NaN]) {
      const r = validateSettings({ ...DEFAULT_SETTINGS, delayMinutes });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(Object.keys(r.errors)).toEqual(['delayMinutes']);
    }
  });

  it('rejects a non-boolean enabled', () => {
    const r = validateSettings({ ...DEFAULT_SETTINGS, enabled: 'yes' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors)).toEqual(['enabled']);
  });

  it('rejects missing fields', () => {
    const r = validateSettings({});
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(Object.keys(r.errors).sort()).toEqual([
        'delayMinutes',
        'enabled',
        'endTime',
        'startTime',
      ]);
  });

  it('rejects non-object input', () => {
    for (const bad of [null, undefined, 'x', 42, [], true]) {
      expect(validateSettings(bad).ok).toBe(false);
    }
  });
});
