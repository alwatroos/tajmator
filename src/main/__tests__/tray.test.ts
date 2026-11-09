import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../shared/settings.ts';
import type { AppState } from '../../shared/types.ts';
import { buildTrayMenuTemplate, trayIconPath } from '../tray.ts';

vi.mock('electron', () => ({ Menu: {}, Tray: class {}, nativeImage: {} }));

const base: AppState = {
  settings: { ...DEFAULT_SETTINGS },
  status: 'active',
  idleMinutes: 0,
  earlyStartAt: null,
  accessibilityGranted: true,
  lastTickAt: null,
};
const actions = {
  setEnabled: vi.fn(),
  openWindow: vi.fn(),
  grantAccessibility: vi.fn(),
  quit: vi.fn(),
};
const labels = (t: { label?: string }[]) => t.map((i) => i.label);

describe('buildTrayMenuTemplate', () => {
  it('active', () => {
    const t = buildTrayMenuTemplate(base, actions);
    expect(labels(t)).toEqual([
      'Active',
      undefined,
      'Enabled',
      'Open Tajmator…',
      undefined,
      'Quit',
    ]);
    expect(t[0]?.enabled).toBe(false);
    expect(t[2]?.checked).toBe(true);
  });

  it('idle shows minutes, sleep shows Sleeping', () => {
    expect(
      buildTrayMenuTemplate({ ...base, status: 'idle', idleMinutes: 4 }, actions)[0]?.label,
    ).toBe('Idle · 4 min');
    expect(buildTrayMenuTemplate({ ...base, status: 'sleep' }, actions)[0]?.label).toBe('Sleeping');
  });

  it('shows early start time', () => {
    const iso = new Date(2026, 5, 1, 6, 5).toISOString();
    const t = buildTrayMenuTemplate({ ...base, earlyStartAt: iso }, actions);
    expect(t[0]?.label).toBe('Active · started early 06:05');
  });

  it('adds the accessibility item only when missing', () => {
    const t = buildTrayMenuTemplate({ ...base, accessibilityGranted: false }, actions);
    expect(labels(t)).toContain('Grant Accessibility permission…');
    t.find((i) => i.label?.startsWith('Grant'))?.click?.({} as never, undefined, {} as never);
    expect(actions.grantAccessibility).toHaveBeenCalled();
  });

  it('inserts extra sections before Quit', () => {
    const t = buildTrayMenuTemplate(base, actions, [[{ label: 'Check for updates' }]]);
    const l = labels(t);
    expect(l.indexOf('Check for updates')).toBeGreaterThan(l.indexOf('Open Tajmator…'));
    expect(l.indexOf('Check for updates')).toBeLessThan(l.indexOf('Quit'));
  });

  it('toggle calls setEnabled', () => {
    const t = buildTrayMenuTemplate(base, actions);
    t[2]?.click?.({ checked: false } as never, undefined, {} as never);
    expect(actions.setEnabled).toHaveBeenCalledWith(false);
  });
});

describe('trayIconPath', () => {
  it('maps status to file', () => {
    expect(trayIconPath('idle', '/a')).toBe('/a/tray/tray-idle.png');
  });
});
