import { useAtom, useAtomValue } from 'jotai';
import type { FormEvent } from 'react';
import { validateSettings } from '../../shared/settings.ts';
import type { Settings, SettingsErrors } from '../../shared/types.ts';
import { appStateAtom, draftAtom, saveResultAtom } from '../atoms.ts';

/** Working hours, delay and enabled toggle with inline validation. */
export function SettingsForm() {
  const state = useAtomValue(appStateAtom);
  const [draft, setDraft] = useAtom(draftAtom);
  const [saveResult, setSaveResult] = useAtom(saveResultAtom);
  if (!state) return null;

  const values: Settings = { ...state.settings, ...draft };
  const validation = validateSettings(values);
  const errors: SettingsErrors = !validation.ok
    ? validation.errors
    : saveResult && !saveResult.ok
      ? saveResult.errors
      : {};

  const edit = (patch: Partial<Settings>) => {
    setDraft({ ...draft, ...patch });
    setSaveResult(null);
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!validation.ok) return;
    const result = await window.tajmator.updateSettings(validation.settings);
    setSaveResult(result);
    if (result.ok) setDraft(null);
  };

  return (
    <form className="settings" onSubmit={onSubmit} noValidate>
      <label className="toggle">
        <input
          type="checkbox"
          checked={values.enabled}
          onChange={(e) => edit({ enabled: e.target.checked })}
        />
        Enabled
      </label>
      <label>
        Start time
        <input
          type="time"
          value={values.startTime}
          onChange={(e) => edit({ startTime: e.target.value })}
        />
        {errors.startTime && <span className="error">{errors.startTime}</span>}
      </label>
      <label>
        End time
        <input
          type="time"
          value={values.endTime}
          onChange={(e) => edit({ endTime: e.target.value })}
        />
        {errors.endTime && <span className="error">{errors.endTime}</span>}
      </label>
      <label>
        Delay (minutes)
        <input
          type="number"
          min={1}
          max={60}
          step={1}
          value={Number.isNaN(values.delayMinutes) ? '' : values.delayMinutes}
          onChange={(e) => edit({ delayMinutes: e.target.valueAsNumber })}
        />
        {errors.delayMinutes && <span className="error">{errors.delayMinutes}</span>}
      </label>
      {errors.enabled && <span className="error">{errors.enabled}</span>}
      <button type="submit" disabled={!validation.ok}>
        Save
      </button>
      {saveResult?.ok && <span className="saved">Saved</span>}
    </form>
  );
}
