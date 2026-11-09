import { createRequire } from 'node:module';
import type { CursorDriver } from './engine.ts';

interface RobotJs {
  getMousePos(): { x: number; y: number };
  moveMouse(x: number, y: number): void;
  setMouseDelay(ms: number): void;
}

/**
 * Creates the cursor driver backed by `@jitsi/robotjs`. The native module is loaded with
 * `createRequire` so the bundler leaves it alone.
 */
export function createRobotCursor(): CursorDriver {
  const require = createRequire(import.meta.url);
  const robot = require('@jitsi/robotjs') as RobotJs;
  robot.setMouseDelay(2);
  return {
    getPosition: () => robot.getMousePos(),
    moveTo: (p) => robot.moveMouse(p.x, p.y),
  };
}
