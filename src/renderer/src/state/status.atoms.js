import { atom } from 'jotai';

/** Latest scheduler status pushed from the main process, or null. */
export const statusAtom = atom(/** @type {AppStatus | null} */ (null));
