import { describe, expect, it, vi } from 'vitest';
import { IPC_CHANNELS } from '../../shared/ipc.ts';
import { DEFAULT_SETTINGS } from '../../shared/settings.ts';
import { Engine } from '../engine.ts';
import { applyTrayToggle, registerIpcHandlers } from '../ipc.ts';

function setup() {
  const handlers = new Map<string, (...a: unknown[]) => unknown>();
  const engine = new Engine(
    {
      cursor: { getPosition: () => ({ x: 0, y: 0 }), moveTo: () => {} },
      now: () => new Date(2026, 5, 1, 10, 0),
      isAccessibilityGranted: () => true,
      setInterval: () => 0,
      clearInterval: () => {},
    },
    { ...DEFAULT_SETTINGS },
  );
  const saved: unknown[] = [];
  const broadcast = vi.fn();
  registerIpcHandlers({
    ipcMain: { handle: (c, h) => void handlers.set(c, h as never) },
    engine,
    saveSettings: (s) => saved.push(s),
    broadcast,
    openAccessibilitySettings: async () => {},
  });
  const call = (c: string, ...a: unknown[]) => handlers.get(c)?.({}, ...a);
  return { engine, saved, broadcast, call };
}

describe('registerIpcHandlers', () => {
  it('reports a save failure but still applies the settings', () => {
    const handlers = new Map<string, (...a: unknown[]) => unknown>();
    const engine = new Engine(
      {
        cursor: { getPosition: () => ({ x: 0, y: 0 }), moveTo: () => {} },
        now: () => new Date(2026, 5, 1, 10, 0),
        isAccessibilityGranted: () => true,
        setInterval: () => 0,
        clearInterval: () => {},
      },
      { ...DEFAULT_SETTINGS },
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});
    registerIpcHandlers({
      ipcMain: { handle: (c, h) => void handlers.set(c, h as never) },
      engine,
      saveSettings: () => {
        throw new Error('EROFS');
      },
      broadcast: vi.fn(),
      openAccessibilitySettings: async () => {},
    });
    const r = handlers.get(IPC_CHANNELS.updateSettings)?.({}, { delayMinutes: 7 });
    expect(r).toMatchObject({ ok: false, saveError: expect.any(String) });
    expect(engine.getState().settings.delayMinutes).toBe(7);
  });

  it('merges, validates, saves and applies a patch', () => {
    const { engine, saved, broadcast, call } = setup();
    const r = call(IPC_CHANNELS.updateSettings, { delayMinutes: 5 });
    expect(r).toMatchObject({ ok: true });
    expect(saved).toEqual([{ ...DEFAULT_SETTINGS, delayMinutes: 5 }]);
    expect(engine.getState().settings.delayMinutes).toBe(5);
    expect(broadcast).toHaveBeenCalled();
  });

  it('rejects invalid patches without saving', () => {
    const { saved, call } = setup();
    const r = call(IPC_CHANNELS.updateSettings, { endTime: '03:00' });
    expect(r).toMatchObject({ ok: false, errors: { endTime: expect.any(String) } });
    expect(saved).toHaveLength(0);
    expect(call(IPC_CHANNELS.updateSettings, 'junk')).toMatchObject({ ok: true });
  });

  it('returns state', () => {
    expect(setup().call(IPC_CHANNELS.getState)).toMatchObject({ status: 'active' });
  });
});

describe('applyTrayToggle', () => {
  const makeEngine = () =>
    new Engine(
      {
        cursor: { getPosition: () => ({ x: 0, y: 0 }), moveTo: () => {} },
        now: () => new Date(2026, 5, 1, 10, 0),
        isAccessibilityGranted: () => true,
        setInterval: () => 0,
        clearInterval: () => {},
      },
      { ...DEFAULT_SETTINGS, enabled: true },
    );

  it('shows the error and still applies the setting when saving fails', () => {
    const engine = makeEngine();
    const showError = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    applyTrayToggle(
      {
        engine,
        saveSettings: () => {
          throw new Error('EROFS');
        },
        showError,
      },
      false,
    );
    expect(engine.getState().settings.enabled).toBe(false);
    expect(showError).toHaveBeenCalledTimes(1);
    expect(showError).toHaveBeenCalledWith(
      'Settings not saved',
      expect.stringContaining('Could not save settings to disk'),
    );
  });

  it('saves without showing an error when saving succeeds', () => {
    const engine = makeEngine();
    const saved: unknown[] = [];
    const showError = vi.fn();
    applyTrayToggle({ engine, saveSettings: (s) => saved.push(s), showError }, false);
    expect(saved).toEqual([{ ...DEFAULT_SETTINGS, enabled: false }]);
    expect(showError).not.toHaveBeenCalled();
  });
});
