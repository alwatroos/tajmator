import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../shared/settings.ts';
import type { Settings } from '../../shared/types.ts';
import { type CursorDriver, Engine, type Point } from '../engine.ts';

function setup(opts: { time?: Date; granted?: boolean; settings?: Settings } = {}) {
  const clock = { now: opts.time ?? new Date(2026, 5, 1, 10, 0, 0) };
  const perm = { granted: opts.granted ?? true };
  const pos: Point = { x: 100, y: 100 };
  const moves: Point[] = [];
  const cursor: CursorDriver = {
    getPosition: () => ({ ...pos }),
    moveTo: (p) => {
      moves.push(p);
      pos.x = p.x;
      pos.y = p.y;
    },
  };
  const timers: { fn: () => void; ms: number; id: number; cleared: boolean }[] = [];
  const engine = new Engine(
    {
      cursor,
      now: () => clock.now,
      isAccessibilityGranted: () => perm.granted,
      setInterval: (fn, ms) => {
        const t = { fn, ms, id: timers.length, cleared: false };
        timers.push(t);
        return t;
      },
      clearInterval: (h) => {
        (h as { cleared: boolean }).cleared = true;
      },
    },
    opts.settings ?? { ...DEFAULT_SETTINGS },
  );
  return { engine, clock, perm, pos, moves, timers };
}

describe('Engine', () => {
  it('nudges alternately +5/-5 when idle', () => {
    const { engine, moves } = setup();
    engine.start();
    engine.tick();
    engine.tick();
    engine.tick();
    expect(moves).toEqual([
      { x: 105, y: 105 },
      { x: 100, y: 100 },
      { x: 105, y: 105 },
    ]);
    expect(engine.getState().status).toBe('idle');
    expect(engine.getState().idleMinutes).toBe(3);
  });

  it('reports active and resets idle when the user moved', () => {
    const { engine, pos, moves } = setup();
    engine.start();
    engine.tick();
    pos.x += 40;
    engine.tick();
    expect(moves).toHaveLength(1);
    expect(engine.getState().status).toBe('active');
    expect(engine.getState().idleMinutes).toBe(0);
  });

  it('never moves outside hours', () => {
    const { engine, moves } = setup({ time: new Date(2026, 5, 1, 18, 0, 0) });
    engine.start();
    engine.tick();
    expect(moves).toHaveLength(0);
    expect(engine.getState().status).toBe('sleep');
    expect(engine.getState().idleMinutes).toBe(0);
  });

  it('never moves when disabled', () => {
    const { engine, moves } = setup({ settings: { ...DEFAULT_SETTINGS, enabled: false } });
    engine.start();
    engine.tick();
    expect(moves).toHaveLength(0);
    expect(engine.getState().status).toBe('sleep');
  });

  it('does not move without permission but still reports idle', () => {
    const { engine, moves } = setup({ granted: false });
    engine.start();
    engine.tick();
    expect(moves).toHaveLength(0);
    expect(engine.getState().status).toBe('idle');
    expect(engine.getState().accessibilityGranted).toBe(false);
  });

  it('does not throw when moving fails', () => {
    const { engine } = setup();
    const e = new Engine(
      {
        cursor: {
          getPosition: () => ({ x: 1, y: 1 }),
          moveTo: () => {
            throw new Error('denied');
          },
        },
        now: () => new Date(2026, 5, 1, 10, 0),
        isAccessibilityGranted: () => true,
        setInterval: () => 0,
        clearInterval: () => {},
      },
      { ...DEFAULT_SETTINGS },
    );
    e.start();
    expect(() => e.tick()).not.toThrow();
    expect(engine).toBeDefined();
  });

  it('applySettings reschedules with the new delay and sleeps at once when disabled', () => {
    const { engine, timers } = setup();
    engine.start();
    expect(timers[0]?.ms).toBe(60_000);
    const seen: string[] = [];
    engine.onChange((st) => seen.push(st.status));
    engine.applySettings({ ...DEFAULT_SETTINGS, delayMinutes: 5 });
    expect(timers[0]?.cleared).toBe(true);
    expect(timers[1]?.ms).toBe(300_000);
    engine.applySettings({ ...DEFAULT_SETTINGS, delayMinutes: 5, enabled: false });
    expect(engine.getState().status).toBe('sleep');
    expect(seen.at(-1)).toBe('sleep');
  });

  it('idle time grows by the delay', () => {
    const { engine } = setup({ settings: { ...DEFAULT_SETTINGS, delayMinutes: 5 } });
    engine.start();
    engine.tick();
    engine.tick();
    expect(engine.getState().idleMinutes).toBe(10);
  });

  it('an early start opens the window before the start time', () => {
    const { engine, clock, pos, moves } = setup({ time: new Date(2026, 5, 1, 6, 0, 0) });
    engine.start();
    for (let m = 0; m <= 10; m++) {
      clock.now = new Date(2026, 5, 1, 6, m, 0);
      pos.x += 20;
      engine.tick();
    }
    expect(engine.getState().earlyStartAt).not.toBeNull();
    expect(engine.getState().status).toBe('active');
    clock.now = new Date(2026, 5, 1, 6, 11, 0);
    engine.tick();
    expect(moves).toHaveLength(1);
  });

  it('stop clears the timer', () => {
    const { engine, timers } = setup();
    engine.start();
    engine.stop();
    expect(timers[0]?.cleared).toBe(true);
  });
});
