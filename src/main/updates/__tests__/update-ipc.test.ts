import { describe, expect, it, vi } from 'vitest';
import { IPC_CHANNELS } from '../../../shared/ipc.ts';
import type { UpdateStatus } from '../../../shared/updates.ts';
import { registerUpdateIpc, type UpdateIpcDeps } from '../update-ipc.ts';
import type { UpdateService } from '../update-service.ts';

vi.mock('electron', () => ({}));

const status = { phase: 'idle' } as UpdateStatus;

describe('registerUpdateIpc', () => {
  it('registers the channels, delegates to the service and broadcasts changes', async () => {
    const handlers = new Map<string, () => unknown>();
    let listener: (s: UpdateStatus) => void = () => {};
    const service = {
      getStatus: vi.fn(() => status),
      check: vi.fn(async () => status),
      download: vi.fn(async () => status),
      onChange: vi.fn((l: (s: UpdateStatus) => void) => {
        listener = l;
        return () => {};
      }),
    } as unknown as UpdateService;
    const install = vi.fn(async () => ({ outcome: 'cancelled' as const }));
    const broadcast = vi.fn();
    registerUpdateIpc({
      ipcMain: {
        handle: (channel: string, fn: () => unknown) => void handlers.set(channel, fn),
      } as unknown as UpdateIpcDeps['ipcMain'],
      service,
      install,
      broadcast,
    });
    expect(await handlers.get(IPC_CHANNELS.getUpdateStatus)?.()).toBe(status);
    await handlers.get(IPC_CHANNELS.checkForUpdates)?.();
    await handlers.get(IPC_CHANNELS.downloadUpdate)?.();
    expect(await handlers.get(IPC_CHANNELS.installUpdate)?.()).toEqual({ outcome: 'cancelled' });
    expect(service.check).toHaveBeenCalledTimes(1);
    expect(service.download).toHaveBeenCalledTimes(1);
    expect(install).toHaveBeenCalledTimes(1);
    listener(status);
    expect(broadcast).toHaveBeenCalledWith(status);
  });
});
