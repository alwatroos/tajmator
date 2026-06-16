/**
 * A single toggleable weekday button.
 * @param {Object} props - Component props.
 * @param {{value: number, label: string}} props.day - Weekday descriptor.
 * @param {boolean} props.active - Whether the day is currently selected.
 * @param {(value: number) => void} props.onToggle - Toggle handler.
 * @returns {JSX.Element} The weekday button.
 */
export const DayButton = ({ day, active, onToggle }) => (
  <button
    type="button"
    className={active ? 'day on' : 'day'}
    aria-pressed={active}
    onClick={() => onToggle(day.value)}
  >
    {day.label}
  </button>
);
