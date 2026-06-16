import { describe, expect, it } from 'vitest';
import { toggleDay } from './days.util.js';

describe('toggleDay', () => {
  it('adds a missing day', () => {
    expect(toggleDay([1, 2], 3)).toEqual([1, 2, 3]);
  });

  it('removes a present day', () => {
    expect(toggleDay([1, 2, 3], 2)).toEqual([1, 3]);
  });

  it('does not mutate the input', () => {
    const days = [1, 2];
    toggleDay(days, 3);
    expect(days).toEqual([1, 2]);
  });
});
