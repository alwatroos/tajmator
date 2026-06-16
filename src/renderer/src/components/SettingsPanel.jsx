import { StatusBadge } from './StatusBadge.jsx';
import { EnableToggle } from './EnableToggle.jsx';
import { TimeWindowField } from './TimeWindowField.jsx';
import { DaySelector } from './DaySelector.jsx';
import { IdleThresholdField } from './IdleThresholdField.jsx';

/**
 * Compose the configuration UI from its domain sections.
 * @returns {JSX.Element} The settings panel.
 */
export const SettingsPanel = () => (
  <section className="panel">
    <h1>Tajmator</h1>
    <StatusBadge />
    <EnableToggle />
    <TimeWindowField />
    <DaySelector />
    <IdleThresholdField />
  </section>
);
