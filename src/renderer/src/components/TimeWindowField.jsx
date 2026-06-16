import { useAtomValue, useSetAtom } from 'jotai';
import { settingsAtom, updateSettingsAtom } from '../state/settings.atoms.js';

/**
 * Editor for the active time window (start and end times).
 * @returns {JSX.Element} The time-window fieldset.
 */
export const TimeWindowField = () => {
  const { startTime, endTime } = useAtomValue(settingsAtom);
  const update = useSetAtom(updateSettingsAtom);
  return (
    <fieldset className="row">
      <legend>Przedział czasowy</legend>
      <input type="time" value={startTime} onChange={(e) => update({ startTime: e.target.value })} />
      <span className="dash">–</span>
      <input type="time" value={endTime} onChange={(e) => update({ endTime: e.target.value })} />
    </fieldset>
  );
};
