import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../shared/settings.ts';
import { loadSettings, saveSettings } from '../settings-store.ts';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tajmator-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('settings-store', () => {
  it('returns defaults when the file is missing', () => {
    expect(loadSettings(join(dir, 'settings.json'))).toEqual(DEFAULT_SETTINGS);
  });

  it('returns defaults for garbage', () => {
    const f = join(dir, 's.json');
    writeFileSync(f, '{not json');
    expect(loadSettings(f)).toEqual(DEFAULT_SETTINGS);
    writeFileSync(f, '[1]');
    expect(loadSettings(f)).toEqual(DEFAULT_SETTINGS);
  });

  it('falls back field by field', () => {
    const f = join(dir, 's.json');
    writeFileSync(f, JSON.stringify({ startTime: '08:00', delayMinutes: 999, enabled: false }));
    expect(loadSettings(f)).toEqual({
      startTime: '08:00',
      endTime: '17:00',
      delayMinutes: 1,
      enabled: false,
    });
  });

  it('falls back to defaults when end is not after start', () => {
    const f = join(dir, 's.json');
    writeFileSync(f, JSON.stringify({ startTime: '18:00', endTime: '19:00' }));
    expect(loadSettings(f).startTime).toBe('18:00');
    writeFileSync(f, JSON.stringify({ startTime: '18:00' }));
    expect(loadSettings(f)).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips atomically', () => {
    const f = join(dir, 'nested', 's.json');
    const s = { startTime: '06:30', endTime: '15:00', delayMinutes: 3, enabled: false };
    saveSettings(f, s);
    expect(loadSettings(f)).toEqual(s);
    expect(readdirSync(join(dir, 'nested'))).toEqual(['s.json']);
  });
});
