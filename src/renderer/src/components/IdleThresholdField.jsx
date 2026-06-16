import { useAtomValue, useSetAtom } from 'jotai';
import { LIMITS } from '../../../shared/settings.constants.js';
import { settingsAtom, updateSettingsAtom } from '../state/settings.atoms.js';

/**
 * Numeric editor for the idle threshold (seconds before jiggling).
 * @returns {JSX.Element} The idle-threshold row.
 */
export const IdleThresholdField = () => {
  const { idleThresholdSeconds } = useAtomValue(settingsAtom);
  const update = useSetAtom(updateSettingsAtom);
  const { min, max } = LIMITS.idleThresholdSeconds;
  return (
    <label className="row">
      <span>Bezczynność (s)</span>
      <input
        type="number"
        min={min}
        max={max}
        value={idleThresholdSeconds}
        onChange={(e) => update({ idleThresholdSeconds: Number(e.target.value) })}
      />
    </label>
  );
};
