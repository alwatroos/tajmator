import { useAtomValue } from 'jotai';
import type { CSSProperties } from 'react';
import { appStateAtom } from '../atoms.ts';
import { statusView } from '../status-view.ts';

/** Coloured dot with the current status label and detail. */
export function StatusBadge() {
  const state = useAtomValue(appStateAtom);
  if (!state) return <section className="status">Loading…</section>;
  const view = statusView(state);
  return (
    <section className="status">
      <span className="dot" style={{ '--status-color': view.color } as CSSProperties} />
      <div>
        <div className="status-label">{view.label}</div>
        <div className="status-detail">{view.detail}</div>
      </div>
    </section>
  );
}
