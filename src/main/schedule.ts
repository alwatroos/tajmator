import { parseTime } from '../shared/settings.ts';
import type { Settings } from '../shared/types.ts';

/** How long before the start time activity can count towards an early start. */
export const EARLY_START_LOOKBACK_MINUTES = 120;
/** Sustained activity needed before the start time to trigger an early start. */
export const EARLY_START_MIN_ACTIVE_MINUTES = 10;

const MINUTE_MS = 60_000;

function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * Tells whether `now` falls inside the working window `[start, end)` in local time.
 * An early start replaces the start time on the same day only; the end never changes.
 * @param now - current time.
 * @param s - settings holding the working window.
 * @param earlyStartAt - detected early start, or null.
 */
export function isInWindow(now: Date, s: Settings, earlyStartAt: Date | null): boolean {
  const start = parseTime(s.startTime);
  const end = parseTime(s.endTime);
  if (start === null || end === null) return false;
  let effectiveStart = start;
  if (earlyStartAt && dayKey(earlyStartAt) === dayKey(now)) {
    effectiveStart = Math.min(start, minutesOfDay(earlyStartAt));
  }
  const nowMin = minutesOfDay(now);
  return nowMin >= effectiveStart && nowMin < end;
}

/**
 * Detects that the user started working before the configured start time. Sustained activity
 * (at least {@link EARLY_START_MIN_ACTIVE_MINUTES}) in the {@link EARLY_START_LOOKBACK_MINUTES}
 * before start makes the first sample of that streak today's early start.
 */
export class EarlyStartDetector {
  private day: string | null = null;
  private streakStart: Date | null = null;
  private lastActive: Date | null = null;
  private early: Date | null = null;

  /**
   * Feeds one sample.
   * @param now - sample time.
   * @param userActive - whether the user moved the cursor since the previous sample.
   * @param s - current settings.
   * @returns today's early start, or null.
   */
  observe(now: Date, userActive: boolean, s: Settings): Date | null {
    this.rollDay(now);
    const start = parseTime(s.startTime);
    if (start === null || !userActive || this.early) return this.current(now);
    const nowMin = minutesOfDay(now);
    if (nowMin >= start || nowMin < start - EARLY_START_LOOKBACK_MINUTES) return this.current(now);

    const maxGap = 2 * s.delayMinutes * MINUTE_MS;
    if (
      !this.streakStart ||
      !this.lastActive ||
      now.getTime() - this.lastActive.getTime() > maxGap
    ) {
      this.streakStart = now;
    }
    this.lastActive = now;
    const span = now.getTime() - this.streakStart.getTime();
    if (span >= EARLY_START_MIN_ACTIVE_MINUTES * MINUTE_MS) this.early = this.streakStart;
    return this.current(now);
  }

  /**
   * @param now - current time.
   * @returns today's early start, or null (also when it was detected on an earlier day).
   */
  current(now: Date): Date | null {
    this.rollDay(now);
    return this.early;
  }

  private rollDay(now: Date): void {
    const key = dayKey(now);
    if (key === this.day) return;
    this.day = key;
    this.streakStart = null;
    this.lastActive = null;
    this.early = null;
  }
}
