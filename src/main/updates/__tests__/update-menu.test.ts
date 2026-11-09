import { describe, expect, it, vi } from 'vitest';
import type { UpdatePhase, UpdateStatus } from '../../../shared/updates.ts';
import { buildUpdateMenuSection } from '../update-menu.ts';

vi.mock('electron', () => ({}));

const status = (phase: UpdatePhase, over: Partial<UpdateStatus> = {}): UpdateStatus => ({
  phase,
  currentVersion: '1.0.0',
  checkedAt: null,
  release: { version: '1.1.0', tag: 'v1.1.0', htmlUrl: 'https://github.com/x', notes: '' },
  download: null,
  unverifiableReason: null,
  error: null,
  ...over,
});
const actions = { check: vi.fn(), download: vi.fn(), install: vi.fn() };
const labels = (s: UpdateStatus) => buildUpdateMenuSection(s, actions).map((i) => i.label);
const check = (s: UpdateStatus) =>
  buildUpdateMenuSection(s, actions).find((i) => i.label === 'Check for Updates');

describe('buildUpdateMenuSection', () => {
  it('starts with a disabled status line, then Check for Updates', () => {
    const items = buildUpdateMenuSection(status('idle', { release: null }), actions);
    expect(items[0]).toMatchObject({ label: 'Version 1.0.0', enabled: false });
    expect(items[1]).toMatchObject({ label: 'Check for Updates', enabled: true });
    expect(items).toHaveLength(2);
  });

  it('shows the up to date and failed lines', () => {
    expect(labels(status('up_to_date'))[0]).toBe('Up to date · 1.0.0');
    expect(labels(status('failed', { error: 'x' }))[0]).toBe('Update failed');
    expect(labels(status('unverifiable'))).toHaveLength(2);
  });

  it('offers the download when available', () => {
    expect(labels(status('available'))).toEqual([
      'Update 1.1.0 available',
      'Check for Updates',
      'Download Update 1.1.0',
    ]);
  });

  it('offers the install when verified', () => {
    expect(labels(status('verified'))).toEqual([
      'Update 1.1.0 ready to install',
      'Check for Updates',
      'Install Update 1.1.0 and Restart…',
    ]);
  });

  it('disables Check for Updates while checking, downloading or installing', () => {
    for (const phase of ['checking', 'downloading', 'installing'] as const) {
      expect(check(status(phase))).toMatchObject({ enabled: false });
    }
    expect(labels(status('downloading', { download: { bytes: 50, totalBytes: 200 } }))[0]).toBe(
      'Downloading 1.1.0… 25%',
    );
  });

  it('wires the clicks to the actions', () => {
    const click = (phase: UpdatePhase, index: number) => {
      const handler = buildUpdateMenuSection(status(phase), actions)[index]?.click;
      if (typeof handler !== 'function') throw new Error('item has no click handler');
      (handler as () => void)();
    };
    click('available', 2);
    expect(actions.download).toHaveBeenCalledTimes(1);
    click('verified', 2);
    expect(actions.install).toHaveBeenCalledTimes(1);
    click('idle', 1);
    expect(actions.check).toHaveBeenCalledTimes(1);
  });
});
