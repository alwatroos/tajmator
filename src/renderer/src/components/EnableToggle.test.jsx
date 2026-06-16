import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'jotai';
import { EnableToggle } from './EnableToggle.jsx';

afterEach(() => {
  cleanup();
  delete window.tajmator;
  vi.restoreAllMocks();
});

describe('EnableToggle', () => {
  it('persists a toggle through the bridge', async () => {
    const updateSettings = vi.fn().mockResolvedValue({ enabled: true });
    window.tajmator = { updateSettings };
    render(
      <Provider>
        <EnableToggle />
      </Provider>,
    );
    await userEvent.click(screen.getByRole('checkbox'));
    expect(updateSettings).toHaveBeenCalledWith({ enabled: true });
  });
});
