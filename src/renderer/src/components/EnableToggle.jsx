import { useAtomValue, useSetAtom } from 'jotai';
import { settingsAtom, updateSettingsAtom } from '../state/settings.atoms.js';

/**
 * Master on/off switch bound to the `enabled` setting.
 * @returns {JSX.Element} The toggle row.
 */
export const EnableToggle = () => {
  const { enabled } = useAtomValue(settingsAtom);
  const update = useSetAtom(updateSettingsAtom);
  return (
    <label className="row toggle">
      <span>Aktywne</span>
      <input
        type="checkbox"
        checked={enabled}
        onChange={(event) => update({ enabled: event.target.checked })}
      />
    </label>
  );
};
