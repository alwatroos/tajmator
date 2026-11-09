import { useAtomValue } from 'jotai';
import { useState } from 'react';
import type { InstallUpdateResult, UpdatePhase, UpdateStatus } from '../../shared/updates.ts';
import { updateStatusAtom } from '../atoms.ts';

const PHASE_TEXT: Record<UpdatePhase, string> = {
  idle: 'Not checked yet.',
  checking: 'Checking for updates…',
  up_to_date: 'Tajmator is up to date.',
  available: 'An update is available.',
  unverifiable: 'An update exists but could not be verified, so it cannot be installed.',
  downloading: 'Downloading the update…',
  verified: 'The update is downloaded and verified.',
  installing: 'Installing the update…',
  failed: 'Update failed.',
};

const isHttps = (url: string): boolean => {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
};

function resultText(result: InstallUpdateResult | null): string | null {
  if (!result) return null;
  if (result.outcome === 'manual') return result.note;
  if (result.outcome === 'failed') return result.error;
  return null;
}

/** Current version, update phase, release notes and the Check / Download / Install buttons. */
export function UpdatesSection() {
  const status = useAtomValue(updateStatusAtom);
  const [result, setResult] = useState<InstallUpdateResult | null>(null);
  if (!status) return null;

  const busy = ['checking', 'downloading', 'installing'].includes(status.phase);
  const install = async () => setResult(await window.tajmator.installUpdate());
  const note = resultText(result);

  return (
    <section className="updates">
      <h2>Updates</h2>
      <p>Version {status.currentVersion}</p>
      <p>{PHASE_TEXT[status.phase]}</p>
      <Details status={status} />
      {note ? <p className="error">{note}</p> : null}
      <div className="actions">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setResult(null);
            void window.tajmator.checkForUpdates();
          }}
        >
          Check for updates
        </button>
        {status.phase === 'available' ? (
          <button type="button" onClick={() => void window.tajmator.downloadUpdate()}>
            Download {status.release?.version}
          </button>
        ) : null}
        {status.phase === 'verified' ? (
          <button type="button" onClick={() => void install()}>
            Install and restart
          </button>
        ) : null}
      </div>
    </section>
  );
}

function Details({ status }: { status: UpdateStatus }) {
  const { release, download } = status;
  return (
    <>
      {status.error ? <p className="error">{status.error}</p> : null}
      {status.unverifiableReason ? <p className="error">{status.unverifiableReason}</p> : null}
      {status.phase === 'downloading' && download ? (
        <progress value={download.bytes} max={download.totalBytes || undefined} />
      ) : null}
      {release && status.phase !== 'up_to_date' ? (
        <>
          <p>
            Latest: {release.version}
            {isHttps(release.htmlUrl) ? (
              <>
                {' '}
                (
                <a href={release.htmlUrl} target="_blank" rel="noreferrer">
                  release page
                </a>
                )
              </>
            ) : null}
          </p>
          {release.notes ? <p className="notes">{release.notes}</p> : null}
        </>
      ) : null}
    </>
  );
}
