import { contextBridge, ipcRenderer } from 'electron';
import type { TajmatorBridge } from '../shared/ipc.ts';
import { BRIDGE_KEY, IPC_CHANNELS } from '../shared/ipc.ts';
import type { AppState } from '../shared/types.ts';
import type { UpdateStatus } from '../shared/updates.ts';

const bridge: TajmatorBridge = {
  getState: () => ipcRenderer.invoke(IPC_CHANNELS.getState),
  updateSettings: (patch) => ipcRenderer.invoke(IPC_CHANNELS.updateSettings, patch),
  onStateChanged: (listener) => {
    const handler = (_event: unknown, state: AppState): void => listener(state);
    ipcRenderer.on(IPC_CHANNELS.stateChanged, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.stateChanged, handler);
    };
  },
  openAccessibilitySettings: () => ipcRenderer.invoke(IPC_CHANNELS.openAccessibilitySettings),
  getUpdateStatus: () => ipcRenderer.invoke(IPC_CHANNELS.getUpdateStatus),
  checkForUpdates: () => ipcRenderer.invoke(IPC_CHANNELS.checkForUpdates),
  downloadUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.downloadUpdate),
  installUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.installUpdate),
  onUpdateStatusChanged: (listener) => {
    const handler = (_event: unknown, status: UpdateStatus): void => listener(status);
    ipcRenderer.on(IPC_CHANNELS.updateStatusChanged, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.updateStatusChanged, handler);
    };
  },
};

contextBridge.exposeInMainWorld(BRIDGE_KEY, bridge);
