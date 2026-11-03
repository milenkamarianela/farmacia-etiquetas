import { describe, expect, it } from 'vitest';
import { formatPercentChange, formatRelative, plural } from './format';

describe('format', () => {
  it('usa singular y plural', () => {
    expect(plural(1, 'producto nuevo', 'productos nuevos')).toBe('1 producto nuevo');
    expect(plural(0, 'producto nuevo', 'productos nuevos')).toBe('0 productos nuevos');
    expect(plural(1500, 'etiqueta', 'etiquetas')).toBe('1.500 etiquetas');
  });

  it('calcula variaciones de precio', () => {
    expect(formatPercentChange(100_000, 109_100)).toBe('+9,1 %');
    expect(formatPercentChange(100_000, 90_000)).toBe('-10 %');
    expect(formatPercentChange(0, 100)).toBeNull();
  });

  it('expresa tiempos relativos', () => {
    const now = new Date('2026-11-03T12:00:00Z').getTime();
    expect(formatRelative('2026-11-03T11:59:30Z', now)).toBe('recién');
    expect(formatRelative('2026-11-03T11:55:00Z', now)).toBe('hace 5 minutos');
    expect(formatRelative('2026-11-02T12:00:00Z', now)).toBe('ayer');
  });
});
