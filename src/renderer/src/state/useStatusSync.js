import { useEffect } from 'react';
import { useSetAtom } from 'jotai';
import { statusAtom } from './status.atoms.js';
import { getBridge } from './bridge.js';

/**
 * React hook: subscribe to live scheduler status from the main process.
 * @returns {void}
 */
export const useStatusSync = () => {
  const setStatus = useSetAtom(statusAtom);
  useEffect(() => getBridge().onStatus(setStatus), [setStatus]);
};
