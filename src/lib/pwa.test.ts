import { describe, expect, it } from 'vitest';
import { getInternalNavigationPath } from './pwa';

describe('getInternalNavigationPath', () => {
  const origin = 'https://threadmap.example';

  it('normalizes relative and same-origin targets to internal paths', () => {
    expect(getInternalNavigationPath('/briefing?type=morning#today', origin))
      .toBe('/briefing?type=morning#today');
    expect(getInternalNavigationPath('https://threadmap.example/tools/flight', origin))
      .toBe('/tools/flight');
  });

  it('rejects external, non-HTTP, malformed, and non-string targets', () => {
    expect(getInternalNavigationPath('https://attacker.example/phish', origin)).toBeNull();
    expect(getInternalNavigationPath('//attacker.example/phish', origin)).toBeNull();
    expect(getInternalNavigationPath('javascript:alert(1)', origin)).toBeNull();
    expect(getInternalNavigationPath('https://[', origin)).toBeNull();
    expect(getInternalNavigationPath({ url: '/briefing' }, origin)).toBeNull();
  });
});
