import type { ReactNode } from 'react';
import { PermissionBanner } from './components/PermissionBanner.tsx';
import { SettingsForm } from './components/SettingsForm.tsx';
import { StatusBadge } from './components/StatusBadge.tsx';
import { UpdatesSection } from './components/UpdatesSection.tsx';

/** Window sections in display order. Add new sections here. */
const SECTIONS: { id: string; element: ReactNode }[] = [
  { id: 'status', element: <StatusBadge /> },
  { id: 'permission', element: <PermissionBanner /> },
  { id: 'settings', element: <SettingsForm /> },
  { id: 'updates', element: <UpdatesSection /> },
];

/** Settings window root. */
export function App() {
  return (
    <main>
      <h1>Tajmator</h1>
      {SECTIONS.map((s) => (
        <div key={s.id}>{s.element}</div>
      ))}
    </main>
  );
}
