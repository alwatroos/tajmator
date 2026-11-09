import { describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  openHandler: undefined as undefined | ((d: { url: string }) => { action: string }),
  openExternal: vi.fn(),
}));

vi.mock('electron', () => ({
  app: { on: vi.fn() },
  shell: { openExternal: h.openExternal },
  BrowserWindow: class {
    webContents = {
      setWindowOpenHandler: (fn: typeof h.openHandler) => {
        h.openHandler = fn;
      },
      on: vi.fn(),
    };
    setMenuBarVisibility = vi.fn();
    on = vi.fn();
    once = vi.fn();
    loadFile = vi.fn(async () => {});
  },
}));

const { createSettingsWindow, isAllowedExternalUrl } = await import('../window.ts');

describe('isAllowedExternalUrl', () => {
  it.each([
    'https://github.com/alwatroos/tajmator/releases/tag/v1.0.1',
    'https://github.com/alwatroos/tajmator/releases',
  ])('accepts %s', (url) => {
    expect(isAllowedExternalUrl(url)).toBe(true);
  });

  it.each([
    'https://github.com/alwatroos/tajmator-evil/',
    'https://github.com/alwatroos/tajmator',
    'https://github.com/other/repo/',
    'https://github.com.evil.example/alwatroos/tajmator/',
    'https://evil.example/alwatroos/tajmator/',
    'https://user:pw@github.com/alwatroos/tajmator/',
    'https://user@github.com/alwatroos/tajmator/',
    'http://github.com/alwatroos/tajmator/',
    'javascript:alert(1)',
    'https://github.com:8443/alwatroos/tajmator/',
    'https://github.com/alwatroos/tajmator/../evil/',
    'not a url',
  ])('rejects %j', (url) => {
    expect(isAllowedExternalUrl(url)).toBe(false);
  });
});

describe('window open handler', () => {
  it('opens allowed links externally, drops the rest, and always denies', () => {
    createSettingsWindow('/r').show();
    const allowed = 'https://github.com/alwatroos/tajmator/releases';
    expect(h.openHandler?.({ url: allowed })).toEqual({ action: 'deny' });
    expect(h.openHandler?.({ url: 'https://evil.example/' })).toEqual({ action: 'deny' });
    expect(h.openExternal).toHaveBeenCalledTimes(1);
    expect(h.openExternal).toHaveBeenCalledWith(allowed);
  });
});
