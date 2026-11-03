import bwipjs from 'bwip-js';
import { describe, expect, it } from 'vitest';
import { encodeBarcode, modulesToBars } from './barcode-encoding.js';

/**
 * Referencia independiente: bwip-js (implementación de BWIPP) dibuja cada barra como una línea
 * vertical centrada con "stroke-width" igual a su ancho en módulos (scale: 1).
 * Reconstruimos la secuencia de módulos a partir de ese SVG y la comparamos con la nuestra.
 */
function referenceModules(bcid: 'ean13' | 'ean8' | 'upca', text: string, length: number): string {
  const svg = bwipjs.toSVG({ bcid, text, scale: 1, height: 5, includetext: false });
  const modules = Array<string>(length).fill('0');
  for (const [, width, path] of svg.matchAll(/stroke-width="(\d+)" d="([^"]+)"/g)) {
    for (const [, x] of path!.matchAll(/M([\d.]+) /g)) {
      const start = Math.round(Number(x) - Number(width) / 2);
      for (let i = 0; i < Number(width); i++) modules[start + i] = '1';
    }
  }
  return modules.join('');
}

describe('encodeBarcode', () => {
  it.each(['4006381333931', '7791234567898', '7790001000019', '0012345678905', '9780201379624'])(
    'EAN-13 %s coincide barra por barra con bwip-js',
    (code) => {
      const encoded = encodeBarcode(code)!;
      expect(encoded.modules).toHaveLength(95);
      expect(encoded.modules).toBe(referenceModules('ean13', code, 95));
    },
  );

  it.each(['96385074', '55123457'])('EAN-8 %s coincide con bwip-js', (code) => {
    const encoded = encodeBarcode(code)!;
    expect(encoded).toMatchObject({ kind: 'EAN8', quietZoneLeft: 7 });
    expect(encoded.modules).toHaveLength(67);
    expect(encoded.modules).toBe(referenceModules('ean8', code, 67));
  });

  it('UPC-A se dibuja igual que bwip-js y conserva sus 12 dígitos como texto', () => {
    const encoded = encodeBarcode('036000291452')!;
    expect(encoded.text).toBe('036000291452');
    expect(encoded.modules).toBe(referenceModules('upca', '036000291452', 95));
  });

  it('no codifica códigos inválidos ni GTIN-14', () => {
    expect(encodeBarcode('7791234567890')).toBeNull();
    expect(encodeBarcode('abc')).toBeNull();
    expect(encodeBarcode('10012345678902')).toBeNull();
  });
});

describe('modulesToBars', () => {
  it('agrupa módulos contiguos', () => {
    expect(modulesToBars('1011100110')).toEqual([
      { start: 0, width: 1 },
      { start: 2, width: 3 },
      { start: 7, width: 2 },
    ]);
  });
});
