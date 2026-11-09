import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../shared/settings.ts';
import { type AppState, STATUS_COLORS } from '../../shared/types.ts';
import { statusView } from '../status-view.ts';

function makeState(patch: Partial<AppState> = {}): AppState {
  return {
    settings: DEFAULT_SETTINGS,
    status: 'active',
    idleMinutes: 0,
    earlyStartAt: null,
    accessibilityGranted: true,
    lastTickAt: null,
    ...patch,
  };
}

describe('statusView', () => {
  it('shows active with the active colour', () => {
    const v = statusView(makeState());
    expect(v.label).toBe('Active');
    expect(v.color).toBe(STATUS_COLORS.active);
  });

  it('shows idle minutes', () => {
    const v = statusView(makeState({ status: 'idle', idleMinutes: 3 }));
    expect(v.label).toBe('Idle');
    expect(v.color).toBe(STATUS_COLORS.idle);
    expect(v.detail).toContain('3 min');
  });

  it('shows sleeping outside hours', () => {
    const v = statusView(makeState({ status: 'sleep' }));
    expect(v.label).toBe('Sleeping');
    expect(v.color).toBe(STATUS_COLORS.sleep);
    expect(v.detail).toContain('07:00-17:00');
  });

  it('shows disabled when sleeping because of the toggle', () => {
    const v = statusView(
      makeState({ status: 'sleep', settings: { ...DEFAULT_SETTINGS, enabled: false } }),
    );
    expect(v.detail).toBe('Disabled');
  });

  it('mentions an early start', () => {
    const iso = new Date(2026, 10, 9, 6, 5).toISOString();
    const v = statusView(makeState({ earlyStartAt: iso }));
    expect(v.detail).toContain('06:05');
  });
});
