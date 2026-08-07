import { describe, expect, it } from 'vitest';
import { decodeNumericEntity, normalizePrice } from './scrape-parsing';

describe('normalizePrice', () => {
  it('reads the German thousands/decimal convention (F-04)', () => {
    expect(normalizePrice('1.234,56')).toBe('1234.56');
    expect(normalizePrice('1.234.567,89')).toBe('1234567.89');
    expect(normalizePrice('19,99 €')).toBe('19.99');
  });

  it('reads the English convention', () => {
    expect(normalizePrice('1,234.56')).toBe('1234.56');
    expect(normalizePrice('$19.99')).toBe('19.99');
  });

  it('treats a lone three-digit group as thousands, not a fraction', () => {
    expect(normalizePrice('1.234')).toBe('1234');
    expect(normalizePrice('1,234')).toBe('1234');
  });

  it('passes through a plain integer', () => {
    expect(normalizePrice('999')).toBe('999');
    expect(normalizePrice('EUR 42')).toBe('42');
  });

  it('rejects values it cannot read as a price', () => {
    expect(normalizePrice('12.3456')).toBeUndefined();
    expect(normalizePrice('')).toBeUndefined();
    expect(normalizePrice(undefined)).toBeUndefined();
    expect(normalizePrice('abc')).toBeUndefined();
    expect(normalizePrice(',99')).toBeUndefined();
  });

  it('survives the route sanitizer that used to reject these', () => {
    const guard = /^\d{1,8}(?:\.\d{1,2})?$/;
    for (const input of ['1.234,56', '1,234.56', '19,99', '999']) {
      expect(guard.test(normalizePrice(input)!)).toBe(true);
    }
  });
});

describe('decodeNumericEntity', () => {
  it('decodes characters above U+FFFF (F-07)', () => {
    expect(decodeNumericEntity('&#128512;', 128512)).toBe('😀');
    expect(decodeNumericEntity('&#x1F600;', 0x1f600)).toBe('😀');
  });

  it('decodes ordinary characters', () => {
    expect(decodeNumericEntity('&#233;', 233)).toBe('é');
    expect(decodeNumericEntity('&#x2014;', 0x2014)).toBe('—');
  });

  it('leaves invalid code points as written', () => {
    expect(decodeNumericEntity('&#1114112;', 0x110000)).toBe('&#1114112;');
    expect(decodeNumericEntity('&#-1;', -1)).toBe('&#-1;');
    expect(decodeNumericEntity('&#xD800;', 0xd800)).toBe('&#xD800;');
    expect(decodeNumericEntity('&#NaN;', Number.NaN)).toBe('&#NaN;');
  });
});
