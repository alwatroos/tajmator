import type { AppState, Settings, Status } from '../shared/types.ts';
import { EarlyStartDetector, isInWindow } from './schedule.ts';

export interface Point {
  x: number;
  y: number;
}

/** Reads and moves the system cursor. */
export interface CursorDriver {
  getPosition(): Point;
  moveTo(p: Point): void;
}

export interface EngineDeps {
  cursor: CursorDriver;
  now: () => Date;
  isAccessibilityGranted: () => boolean;
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (handle: unknown) => void;
}

const NUDGE_PX = 5;
const MINUTE_MS = 60_000;

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Keeps the cursor moving during working hours. A tick runs every `delayMinutes`; the window is
 * computed from the clock on every tick, so system sleep cannot skew it.
 */
export class Engine {
  private settings: Settings;
  private status: Status;
  private idleMinutes = 0;
  private lastTickAt: string | null = null;
  private accessibilityGranted: boolean;
  private lastPos: Point | null = null;
  private nextMove = NUDGE_PX;
  private handle: unknown = null;
  private running = false;
  private readonly detector = new EarlyStartDetector();
  private readonly listeners = new Set<(state: AppState) => void>();

  constructor(
    private readonly deps: EngineDeps,
    initial: Settings,
  ) {
    this.settings = initial;
    this.accessibilityGranted = this.readPermission();
    this.status = this.inWorkingTime() ? 'active' : 'sleep';
  }

  /** Starts the periodic tick. */
  start(): void {
    this.running = true;
    this.lastPos = this.readPosition();
    this.schedule();
  }

  /** Stops the periodic tick. */
  stop(): void {
    this.running = false;
    this.unschedule();
  }

  /** Runs one cycle. Never throws. */
  tick(): void {
    const now = this.deps.now();
    const s = this.settings;
    this.accessibilityGranted = this.readPermission();
    const pos = this.readPosition();
    const moved = pos !== null && this.lastPos !== null && distance(this.lastPos, pos) >= 1;

    const early = this.detector.observe(now, moved, s);
    if (!s.enabled || !isInWindow(now, s, early)) {
      this.status = 'sleep';
      this.idleMinutes = 0;
    } else if (moved) {
      this.status = 'active';
      this.idleMinutes = 0;
    } else {
      this.status = 'idle';
      this.idleMinutes += s.delayMinutes;
      if (this.accessibilityGranted && pos) {
        try {
          this.deps.cursor.moveTo({ x: pos.x + this.nextMove, y: pos.y + this.nextMove });
        } catch {
          // moving failed (e.g. no permission); try again next tick
        }
        this.nextMove *= -1;
      }
    }
    this.lastPos = this.readPosition() ?? pos;
    this.lastTickAt = now.toISOString();
    this.emit();
  }

  /**
   * Applies new settings: restarts the interval with the new delay and recomputes the status
   * at once (disabling goes to `sleep`).
   */
  applySettings(s: Settings): void {
    this.settings = s;
    if (this.running) {
      this.unschedule();
      this.schedule();
    }
    if (!this.inWorkingTime()) {
      this.status = 'sleep';
      this.idleMinutes = 0;
    } else if (this.status === 'sleep') {
      this.status = 'active';
      this.idleMinutes = 0;
    }
    this.accessibilityGranted = this.readPermission();
    this.emit();
  }

  /** Re-reads the Accessibility permission and emits when it changed. */
  refreshPermission(): void {
    const granted = this.readPermission();
    if (granted === this.accessibilityGranted) return;
    this.accessibilityGranted = granted;
    this.emit();
  }

  /** @returns a snapshot of the current state. */
  getState(): AppState {
    const now = this.deps.now();
    return {
      settings: { ...this.settings },
      status: this.status,
      idleMinutes: this.idleMinutes,
      earlyStartAt: this.detector.current(now)?.toISOString() ?? null,
      accessibilityGranted: this.accessibilityGranted,
      lastTickAt: this.lastTickAt,
    };
  }

  /** Subscribes to state changes. @returns an unsubscribe function. */
  onChange(listener: (state: AppState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private inWorkingTime(): boolean {
    const now = this.deps.now();
    return this.settings.enabled && isInWindow(now, this.settings, this.detector.current(now));
  }

  private schedule(): void {
    this.handle = this.deps.setInterval(() => this.tick(), this.settings.delayMinutes * MINUTE_MS);
  }

  private unschedule(): void {
    if (this.handle !== null) this.deps.clearInterval(this.handle);
    this.handle = null;
  }

  private readPosition(): Point | null {
    try {
      return this.deps.cursor.getPosition();
    } catch {
      return null;
    }
  }

  private readPermission(): boolean {
    try {
      return this.deps.isAccessibilityGranted();
    } catch {
      return false;
    }
  }

  private emit(): void {
    const state = this.getState();
    for (const l of [...this.listeners]) l(state);
  }
}
