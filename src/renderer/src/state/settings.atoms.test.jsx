import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'jotai';
import { settingsAtom, updateSettingsAtom } from './settings.atoms.js';
import { DEFAULT_SETTINGS } from '../../../shared/settings.constants.js';

afterEach(() => {
  delete window.tajmator;
  vi.restoreAllMocks();
});

describe('updateSettingsAtom', () => {
  it('optimistically patches the local settings cache', () => {
    window.tajmator = { updateSettings: () => new Promise(() => {}) };
    const store = createStore();
    store.set(updateSettingsAtom, { enabled: true });
    expect(store.get(settingsAtom).enabled).toBe(true);
  });

  it('reconciles with the value returned by the bridge', async () => {
    const saved = { ...DEFAULT_SETTINGS, enabled: true, idleThresholdSeconds: 5 };
    const updateSettings = vi.fn().mockResolvedValue(saved);
    window.tajmator = { updateSettings };
    const store = createStore();
    store.set(updateSettingsAtom, { idleThresholdSeconds: 1 });
    await vi.waitFor(() => expect(store.get(settingsAtom)).toEqual(saved));
    expect(updateSettings).toHaveBeenCalledWith({ idleThresholdSeconds: 1 });
  });
});
