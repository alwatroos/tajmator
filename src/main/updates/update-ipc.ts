import type { IpcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc.ts';
import type { InstallUpdateResult, UpdateStatus } from '../../shared/updates.ts';
import type { UpdateService } from './update-service.ts';

/** Dependencies of {@link registerUpdateIpc}. */
export interface UpdateIpcDeps {
  ipcMain: Pick<IpcMain, 'handle'>;
  service: UpdateService;
  /** Confirms with the user and installs the verified update; never rejects. */
  install: () => Promise<InstallUpdateResult>;
  broadcast: (status: UpdateStatus) => void;
}

/**
 * Registers the updater's renderer-facing IPC handlers. No handler takes a URL or a path from
 * the renderer.
 *
 * @returns a function that removes the status subscription.
 */
export function registerUpdateIpc(deps: UpdateIpcDeps): () => void {
  const { ipcMain, service } = deps;
  ipcMain.handle(IPC_CHANNELS.getUpdateStatus, () => service.getStatus());
  ipcMain.handle(IPC_CHANNELS.checkForUpdates, () => service.check());
  ipcMain.handle(IPC_CHANNELS.downloadUpdate, () => service.download());
  ipcMain.handle(IPC_CHANNELS.installUpdate, () => deps.install());
  return service.onChange((status) => deps.broadcast(status));
}
