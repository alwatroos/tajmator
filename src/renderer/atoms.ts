import { atom } from 'jotai';
import type { AppState, Settings, UpdateSettingsResult } from '../shared/types.ts';

/** Latest state pushed from the main process, null until the first load. */
export const appStateAtom = atom<AppState | null>(null);

/** Fields edited and not yet saved; null means the form shows the saved settings. */
export const draftAtom = atom<Partial<Settings> | null>(null);

/** Outcome of the last save attempt; null before any save or after an edit. */
export const saveResultAtom = atom<UpdateSettingsResult | null>(null);
