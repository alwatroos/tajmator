import type { TajmatorBridge } from '../shared/ipc.ts';

declare global {
  interface Window {
    tajmator: TajmatorBridge;
  }
}
