import { useAtomValue } from 'jotai';
import { statusAtom } from '../state/status.atoms.js';

/**
 * Build a human-readable status label from a status payload.
 * @param {AppStatus | null} status - Latest status, or null when unknown.
 * @returns {string} Display text for the badge.
 */
const describeStatus = (status) => {
  if (!status) return 'Status: nieznany';
  if (!status.enabled) return 'Wyłączone';
  return status.jiggled ? 'Ruszam myszką…' : `Czuwam (bezczynność ${status.idleSeconds}s)`;
};

/**
 * Live status badge reflecting the latest scheduler tick.
 * @returns {JSX.Element} The status badge.
 */
export const StatusBadge = () => {
  const status = useAtomValue(statusAtom);
  return <p className={`status ${status?.enabled ? 'on' : 'off'}`}>{describeStatus(status)}</p>;
};
