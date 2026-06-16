/**
 * IPC channel names shared between the main and renderer processes.
 * Centralized to avoid typos and keep the contract in one place.
 */
export const IPC = {
  getSettings: 'settings:get',
  updateSettings: 'settings:update',
  settingsChanged: 'settings:changed',
  status: 'status:update',
};
