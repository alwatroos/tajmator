import { useEffect } from 'react';
import { useSetAtom } from 'jotai';
import { settingsAtom, settingsLoadingAtom } from './settings.atoms.js';
import { getBridge } from './bridge.js';

/**
 * Fetch initial settings and wire the background change subscription.
 * @param {(s: AppSettings) => void} setSettings - Settings setter.
 * @param {(v: boolean) => void} setLoading - Loading-flag setter.
 * @returns {() => void} Cleanup removing the subscription.
 */
const initSync = (setSettings, setLoading) => {
  const bridge = getBridge();
  bridge.getSettings().then((settings) => {
    setSettings(settings);
    setLoading(false);
  });
  return bridge.onSettingsChanged(setSettings);
};

/**
 * React hook: load settings once and keep them synced with the main process.
 * @returns {void}
 */
export const useSettingsSync = () => {
  const setSettings = useSetAtom(settingsAtom);
  const setLoading = useSetAtom(settingsLoadingAtom);
  useEffect(() => initSync(setSettings, setLoading), [setSettings, setLoading]);
};
