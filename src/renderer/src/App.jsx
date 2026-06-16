import { useAtomValue } from 'jotai';
import { settingsLoadingAtom } from './state/settings.atoms.js';
import { useSettingsSync } from './state/useSettingsSync.js';
import { useStatusSync } from './state/useStatusSync.js';
import { SettingsPanel } from './components/SettingsPanel.jsx';

/**
 * Root component: wires the sync hooks and renders the settings panel.
 * @returns {JSX.Element} The application root.
 */
export const App = () => {
  useSettingsSync();
  useStatusSync();
  const loading = useAtomValue(settingsLoadingAtom);
  return <main className="app">{loading ? <p>Ładowanie…</p> : <SettingsPanel />}</main>;
};
