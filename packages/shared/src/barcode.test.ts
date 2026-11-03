import { describe, expect, it } from 'vitest';
import { gtinCheckDigit, validateBarcode } from './barcode.js';

describe('gtinCheckDigit', () => {
  it('calcula el verificador de EAN-13 conocidos', () => {
    expect(gtinCheckDigit('400638133393')).toBe(1); // 4006381333931
    expect(gtinCheckDigit('779123456789')).toBe(8); // 7791234567898
  });
});

describe('validateBarcode', () => {
  it('acepta EAN-13 válidos y los normaliza', () => {
    expect(validateBarcode(' 7791234567898 ')).toEqual({ ok: true, value: '7791234567898', kind: 'EAN13' });
    expect(validateBarcode('779-1234-567898')).toMatchObject({ ok: true, value: '7791234567898' });
  });

  it('acepta el código cuando Excel lo entrega como número', () => {
    expect(validateBarcode(7791234567898)).toMatchObject({ ok: true, value: '7791234567898' });
  });

  it('acepta EAN-8 y UPC-A', () => {
    expect(validateBarcode('96385074')).toMatchObject({ ok: true, kind: 'EAN8' });
    expect(validateBarcode('036000291452')).toMatchObject({ ok: true, kind: 'UPCA' });
  });

  it.each([
    ['7791234567890', 'dígito verificador'],
    ['77912345', 'dígito verificador'],
    ['12345', '5 dígitos'],
    ['77912A4567898', 'caracteres'],
    ['7.79123E+12', 'notación científica'],
    ['', 'Falta'],
  ])('rechaza "%s"', (input, message) => {
    const result = validateBarcode(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(message);
  });
});
