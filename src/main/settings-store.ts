import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { DEFAULT_SETTINGS, validateSettings } from '../shared/settings.ts';
import type { Settings } from '../shared/types.ts';

/**
 * Loads settings from a JSON file. A missing or unreadable file gives the defaults; an invalid
 * field falls back to its default.
 */
export function loadSettings(file: string): Settings {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ...DEFAULT_SETTINGS };
  }
  const merged = { ...DEFAULT_SETTINGS, ...(raw as Record<string, unknown>) };
  const first = validateSettings(merged);
  if (first.ok) return first.settings;

  const repaired: Record<string, unknown> = { ...merged };
  for (const key of Object.keys(first.errors)) {
    repaired[key] = DEFAULT_SETTINGS[key as keyof Settings];
  }
  const second = validateSettings(repaired);
  return second.ok ? second.settings : { ...DEFAULT_SETTINGS };
}

/** Saves settings atomically: writes a temp file, then renames it over the target. */
export function saveSettings(file: string, s: Settings): void {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(s, null, 2)}\n`);
  renameSync(tmp, file);
}
