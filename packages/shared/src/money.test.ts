import { describe, expect, it } from 'vitest';
import { formatARS, parsePriceToCents } from './money.js';

const cents = (input: unknown) => {
  const result = parsePriceToCents(input);
  if (!result.ok) throw new Error(result.error);
  return result.cents;
};

describe('parsePriceToCents', () => {
  it.each([
    ['12.450,00', 1_245_000],
    ['$ 12.450,00', 1_245_000],
    ['ARS 12.450', 1_245_000],
    ['12.450', 1_245_000],
    ['12450', 1_245_000],
    ['12450,5', 1_245_050],
    ['12450.50', 1_245_050],
    ['12,450.50', 1_245_050],
    ['1.234.567,89', 123_456_789],
    ['0,99', 99],
    [',50', 50],
    ['  980  ', 98_000],
  ])('interpreta "%s" como %i centavos', (input, expected) => {
    expect(cents(input)).toBe(expected);
  });

  it('acepta números de Excel y redondea al centavo', () => {
    expect(cents(12450.5)).toBe(1_245_050);
    expect(cents(0.1 + 0.2)).toBe(30);
    expect(cents(19.999)).toBe(2000);
    expect(cents(12450.55)).toBe(1_245_055);
  });

  it.each([
    ['', 'Falta el precio'],
    ['abc', 'no es un precio válido'],
    ['-100', 'negativo'],
    ['12,345', 'más de 2 decimales'],
    ['1.2.3', 'no es un precio válido'],
    ['12,', 'no es un precio válido'],
    ['0.450', 'no es un precio válido'],
    ['12.45.678,00', 'no es un precio válido'],
    ['99999999999999', 'máximo'],
  ])('rechaza "%s"', (input, message) => {
    const result = parsePriceToCents(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(message);
  });

  it('rechaza valores que no son texto ni número', () => {
    expect(parsePriceToCents(null).ok).toBe(false);
    expect(parsePriceToCents(undefined).ok).toBe(false);
    expect(parsePriceToCents(Number.NaN).ok).toBe(false);
  });
});

describe('formatARS', () => {
  it.each([
    [1_245_000, '$ 12.450,00'],
    [0, '$ 0,00'],
    [5, '$ 0,05'],
    [99, '$ 0,99'],
    [100_000_000, '$ 1.000.000,00'],
    [-150, '-$ 1,50'],
  ])('%i → %s', (input, expected) => {
    expect(formatARS(input)).toBe(expected);
  });

  it('acepta bigint (como llega de la base)', () => {
    expect(formatARS(1_245_000n)).toBe('$ 12.450,00');
  });

  it('es la inversa de parsePriceToCents', () => {
    for (const value of [1, 99, 1_245_000, 123_456_789]) {
      expect(cents(formatARS(value))).toBe(value);
    }
  });
});
