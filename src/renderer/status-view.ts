import type { AppState } from '../shared/types.ts';
import { STATUS_COLORS } from '../shared/types.ts';

export interface StatusView {
  label: string;
  color: string;
  detail: string;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Maps app state to what the status badge shows.
 * @returns label, colour (from STATUS_COLORS) and a secondary detail line.
 */
export function statusView(state: AppState): StatusView {
  const color = STATUS_COLORS[state.status];
  const early = state.earlyStartAt ? `Started early at ${formatTime(state.earlyStartAt)}` : '';
  switch (state.status) {
    case 'active':
      return { label: 'Active', color, detail: early || 'Mouse is moving' };
    case 'idle': {
      const idle = `Idle for ${state.idleMinutes} min`;
      return { label: 'Idle', color, detail: early ? `${idle} · ${early}` : idle };
    }
    case 'sleep':
      return {
        label: 'Sleeping',
        color,
        detail: state.settings.enabled
          ? `Outside working hours (${state.settings.startTime}-${state.settings.endTime})`
          : 'Disabled',
      };
  }
}
