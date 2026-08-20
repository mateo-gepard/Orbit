import { describe, expect, it } from 'vitest';
import { readableForeground } from './utils';

describe('readableForeground', () => {
  it('puts white on dark accents', () => {
    expect(readableForeground('#000000')).toBe('#ffffff');
    expect(readableForeground('#1d4ed8')).toBe('#ffffff');
  });

  it('puts black on light accents', () => {
    expect(readableForeground('#ffffff')).toBe('#000000');
    expect(readableForeground('#6366f1')).toBe('#000000'); // default indigo: black 4.70:1, white 4.46:1
    expect(readableForeground('#fde047')).toBe('#000000'); // pale yellow
    expect(readableForeground('#a7f3d0')).toBe('#000000');
  });

  it('accepts upper case and surrounding space', () => {
    expect(readableForeground('  #FDE047 ')).toBe('#000000');
  });

  it('falls back to white for anything it cannot read', () => {
    expect(readableForeground('')).toBe('#ffffff');
    expect(readableForeground('rebeccapurple')).toBe('#ffffff');
    expect(readableForeground('#fff')).toBe('#ffffff');
  });
});
