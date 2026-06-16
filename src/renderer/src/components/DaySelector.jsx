import { useAtomValue, useSetAtom } from 'jotai';
import { WEEKDAYS } from '../../../shared/settings.constants.js';
import { settingsAtom, updateSettingsAtom } from '../state/settings.atoms.js';
import { toggleDay } from './days.util.js';
import { DayButton } from './DayButton.jsx';

/**
 * Weekday picker controlling which days the jiggler is active.
 * @returns {JSX.Element} The day-selector fieldset.
 */
export const DaySelector = () => {
  const { activeDays } = useAtomValue(settingsAtom);
  const update = useSetAtom(updateSettingsAtom);
  const onToggle = (day) => update({ activeDays: toggleDay(activeDays, day) });
  return (
    <fieldset className="row days">
      <legend>Dni tygodnia</legend>
      {WEEKDAYS.map((day) => (
        <DayButton key={day.value} day={day} active={activeDays.includes(day.value)} onToggle={onToggle} />
      ))}
    </fieldset>
  );
};
