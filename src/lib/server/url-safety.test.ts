import { describe, expect, it } from 'vitest';
import { isPrivateIpAddress, parseHttpUrl } from './url-safety';

describe('URL safety helpers', () => {
  it.each([
    '127.0.0.1',
    '10.0.0.5',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '::1',
    'fd00::1',
    'fe90::1',
    'febf::1',
    'fec0::1',
    'ff02::1',
    '2001:db8::1',
    '2002:7f00:1::',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
  ])('blocks private or local address %s', (ip) => {
    expect(isPrivateIpAddress(ip)).toBe(true);
  });

  it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111', '2001:4860:4860::8888'])('allows public address %s', (ip) => {
    expect(isPrivateIpAddress(ip)).toBe(false);
  });

  it('rejects non-http protocols and embedded credentials', () => {
    expect(() => parseHttpUrl('file:///etc/passwd')).toThrow('Only http and https');
    expect(() => parseHttpUrl('https://user:pass@example.com')).toThrow('embedded credentials');
  });

  it('rejects localhost before DNS resolution', () => {
    expect(() => parseHttpUrl('http://localhost:3000')).toThrow('Local network');
    expect(() => parseHttpUrl('https://[fe90::1]/')).toThrow('Local network');
  });

  it('rejects public hosts on non-standard ports', () => {
    expect(() => parseHttpUrl('https://example.com:8443/path')).toThrow('Non-standard');
    expect(() => parseHttpUrl('http://example.com:8080/path')).toThrow('Non-standard');
    expect(parseHttpUrl('https://example.com:443/path').hostname).toBe('example.com');
  });
});
