import { describe, expect, it } from 'vitest';
import {
  buildProductSearchText,
  getLabelStatus,
  normalizeSearchText,
  productInputSchema,
  productListQuerySchema,
} from './product.js';

describe('búsqueda', () => {
  it('normaliza acentos, mayúsculas y espacios', () => {
    expect(normalizeSearchText('  Algodón   HIDRÓFILO Ñandú ')).toBe('algodon hidrofilo nandu');
  });

  it('arma el texto de búsqueda ignorando campos vacíos', () => {
    expect(
      buildProductSearchText({ name: 'Ibuprofeno', brand: 'Genérico', presentation: null, sku: 'IB-1', barcode: '7791234567898' }),
    ).toBe('ibuprofeno generico ib-1 7791234567898');
  });
});

describe('estado de etiqueta', () => {
  it('distingue nunca impresa, desactualizada y al día', () => {
    expect(getLabelStatus(100, null)).toBe('never');
    expect(getLabelStatus(100, 90)).toBe('outdated');
    expect(getLabelStatus(100, 100)).toBe('current');
  });
});

describe('productListQuerySchema', () => {
  it('convierte los parámetros de la URL y aplica valores por defecto', () => {
    expect(productListQuerySchema.parse({ page: '3', categoryId: '7' })).toMatchObject({
      page: 3,
      pageSize: 50,
      categoryId: 7,
      status: 'active',
      labelStatus: 'all',
    });
  });

  it('limita el tamaño de página', () => {
    expect(productListQuerySchema.safeParse({ pageSize: '1000' }).success).toBe(false);
  });
});

const base = { name: 'Ibuprofeno 400 mg', priceCents: 1_245_000 };

describe('productInputSchema', () => {
  it('normaliza textos vacíos a null y el código de barras', () => {
    const result = productInputSchema.parse({ ...base, barcode: ' 7791234567898 ', sku: '', brand: '  ' });
    expect(result).toMatchObject({ barcode: '7791234567898', sku: null, brand: null, active: true });
  });

  it('exige código de barras o código interno', () => {
    const result = productInputSchema.safeParse(base);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('código interno');
  });

  it('acepta un producto solo con código interno', () => {
    expect(productInputSchema.parse({ ...base, sku: 'MAG-001' }).sku).toBe('MAG-001');
  });

  it('rechaza código de barras inválido y precios no enteros', () => {
    expect(productInputSchema.safeParse({ ...base, barcode: '7791234567890' }).success).toBe(false);
    expect(productInputSchema.safeParse({ ...base, sku: 'A', priceCents: 10.5 }).success).toBe(false);
    expect(productInputSchema.safeParse({ ...base, sku: 'A', priceCents: -1 }).success).toBe(false);
  });
});
