import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../shared/settings.ts';
import { EarlyStartDetector, isInWindow } from '../schedule.ts';

const s = DEFAULT_SETTINGS; // 07:00-17:00, delay 1
const at = (day: number, h: number, m: number) => new Date(2026, 5, day, h, m, 0);

describe('isInWindow', () => {
  it('includes start and excludes end', () => {
    expect(isInWindow(at(1, 6, 59), s, null)).toBe(false);
    expect(isInWindow(at(1, 7, 0), s, null)).toBe(true);
    expect(isInWindow(at(1, 16, 59), s, null)).toBe(true);
    expect(isInWindow(at(1, 17, 0), s, null)).toBe(false);
  });

  it('early start replaces start on the same day only', () => {
    const early = at(1, 6, 30);
    expect(isInWindow(at(1, 6, 45), s, early)).toBe(true);
    expect(isInWindow(at(1, 6, 29), s, early)).toBe(false);
    expect(isInWindow(at(2, 6, 45), s, early)).toBe(false);
  });

  it('never moves the end', () => {
    expect(isInWindow(at(1, 17, 0), s, at(1, 6, 0))).toBe(false);
  });
});

describe('EarlyStartDetector', () => {
  it('triggers after 10 minutes of sustained activity', () => {
    const d = new EarlyStartDetector();
    expect(d.observe(at(1, 6, 0), true, s)).toBeNull();
    for (let m = 1; m < 10; m++) expect(d.observe(at(1, 6, m), true, s)).toBeNull();
    expect(d.observe(at(1, 6, 10), true, s)?.getTime()).toBe(at(1, 6, 0).getTime());
    expect(d.current(at(1, 6, 11))?.getTime()).toBe(at(1, 6, 0).getTime());
  });

  it('a gap longer than 2x delay breaks the streak', () => {
    const d = new EarlyStartDetector();
    d.observe(at(1, 6, 0), true, s);
    d.observe(at(1, 6, 5), true, s); // gap 5 > 2
    expect(d.observe(at(1, 6, 10), true, s)).toBeNull();
  });

  it('tolerates one idle sample between active ones', () => {
    const d = new EarlyStartDetector();
    let result: Date | null = null;
    for (let m = 0; m <= 10; m += 2) result = d.observe(at(1, 6, m), true, s);
    expect(result?.getTime()).toBe(at(1, 6, 0).getTime());
  });

  it('ignores activity outside the lookback and after start', () => {
    const d = new EarlyStartDetector();
    for (let m = 0; m <= 15; m++) d.observe(at(1, 4, m), true, s); // 04:xx is before 05:00
    expect(d.current(at(1, 5, 0))).toBeNull();
    for (let m = 0; m <= 15; m++) d.observe(at(1, 8, m), true, s);
    expect(d.current(at(1, 8, 20))).toBeNull();
  });

  it('ignores inactive samples', () => {
    const d = new EarlyStartDetector();
    for (let m = 0; m <= 20; m++) d.observe(at(1, 6, m), false, s);
    expect(d.current(at(1, 6, 21))).toBeNull();
  });

  it('resets on the next day', () => {
    const d = new EarlyStartDetector();
    for (let m = 0; m <= 10; m++) d.observe(at(1, 6, m), true, s);
    expect(d.current(at(1, 6, 11))).not.toBeNull();
    expect(d.current(at(2, 0, 1))).toBeNull();
    expect(d.observe(at(2, 6, 0), false, s)).toBeNull();
  });
});
