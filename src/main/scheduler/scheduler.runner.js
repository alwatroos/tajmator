import { powerMonitor } from 'electron';
import { shouldJiggle } from './scheduler.logic.js';
import { jiggleMouse } from '../mouse/mouse.mover.js';
import { getSettings } from '../settings/settings.store.js';

/** @type {ReturnType<typeof setInterval> | null} */
let timer = null;
/** @type {(status: AppStatus) => void} */
let statusListener = () => {};

/**
 * Register a listener invoked with the status after every tick.
 * @param {(status: AppStatus) => void} listener - Status callback.
 * @returns {void}
 */
export const onStatus = (listener) => {
  statusListener = listener;
};

/**
 * Run a single evaluation: jiggle when conditions are met, then report status.
 * @returns {Promise<void>} Resolves once the tick completes.
 */
const tick = async () => {
  const settings = getSettings();
  const idleSeconds = powerMonitor.getSystemIdleTime();
  const jiggled = shouldJiggle({ settings, now: new Date(), idleSeconds });
  if (jiggled) await jiggleMouse();
  statusListener({ enabled: settings.enabled, idleSeconds, jiggled, updatedAt: Date.now() });
};

/**
 * Start the periodic scheduler using the configured interval.
 * @returns {void}
 */
export const startScheduler = () => {
  stopScheduler();
  timer = setInterval(() => void tick(), getSettings().checkIntervalSeconds * 1000);
  void tick();
};

/**
 * Stop the periodic scheduler if it is running.
 * @returns {void}
 */
export const stopScheduler = () => {
  if (timer) clearInterval(timer);
  timer = null;
};

/**
 * Restart the scheduler so changed interval settings take effect.
 * @returns {void}
 */
export const restartScheduler = () => startScheduler();
