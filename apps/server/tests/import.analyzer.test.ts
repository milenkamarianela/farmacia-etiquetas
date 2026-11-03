import { describe, expect, it } from 'vitest';
import { type CellValue, type ColumnMapping, type ImportOptions } from '@etiquetas/shared';
import { type ExistingProduct, analyzeImport } from '../src/modules/import/import.analyzer.js';

// Columnas del archivo de prueba: código de barras | código interno | nombre | marca | categoría | precio
const mapping: ColumnMapping = { barcode: 0, sku: 1, name: 2, brand: 3, presentation: null, category: 4, price: 5 };
const defaults: ImportOptions = { createNew: true, updateDetails: false };

const ibuprofeno: ExistingProduct = {
  id: 1,
  barcode: '7791234567898',
  sku: 'IBU-400',
  name: 'Ibuprofeno 400 mg',
  brand: 'Genérico',
  presentation: null,
  category: 'Analgésicos',
  priceCents: 1_000_00,
  active: true,
};
const algodon: ExistingProduct = {
  id: 2,
  barcode: null,
  sku: 'ALG-1',
  name: 'Algodón',
  brand: null,
  presentation: null,
  category: null,
  priceCents: 500_00,
  active: true,
};
const catalog = [ibuprofeno, algodon];

let rowNumber = 1;
const row = (...cells: CellValue[]) => ({ rowNumber: ++rowNumber, cells });
const analyze = (rows: ReturnType<typeof row>[], options: Partial<ImportOptions> = {}, existing = catalog) =>
  analyzeImport(rows, mapping, { ...defaults, ...options }, existing);

describe('identificación de productos', () => {
  it('encuentra por código de barras y detecta el cambio de precio', () => {
    const { rows, updates } = analyze([row('7791234567898', null, null, null, null, '1.250,00')]);
    expect(rows[0]).toMatchObject({
      action: 'update',
      productId: 1,
      oldPriceCents: 1_000_00,
      newPriceCents: 1_250_00,
      priceChanged: true,
      errors: [],
    });
    expect(updates[0]).toMatchObject({ newPriceCents: 1_250_00, details: {} });
  });

  it('acepta el código de barras como número de Excel', () => {
    expect(analyze([row(7791234567898, null, null, null, null, 1000)]).rows[0]).toMatchObject({
      action: 'unchanged',
      productId: 1,
    });
  });

  it('si no hay código de barras, usa el código interno', () => {
    expect(analyze([row(null, 'ALG-1', null, null, null, 600)]).rows[0]).toMatchObject({ productId: 2, action: 'update' });
  });

  it('un precio igual no genera cambio', () => {
    const { rows, updates, summary } = analyze([row('7791234567898', null, null, null, null, '$ 1.000')]);
    expect(rows[0]!.action).toBe('unchanged');
    expect(updates).toHaveLength(0);
    expect(summary).toMatchObject({ unchanged: 1, update: 0, priceChanged: 0 });
  });

  it('rechaza si el código de barras y el interno apuntan a productos distintos', () => {
    const result = analyze([row('7791234567898', 'ALG-1', null, null, null, 100)]).rows[0]!;
    expect(result.action).toBe('reject');
    expect(result.errors[0]).toContain('código interno');
  });

  it('rechaza si el código interno ya tiene otro código de barras', () => {
    const result = analyze([row('4006381333931', 'IBU-400', 'X', null, null, 100)]).rows[0]!;
    expect(result.action).toBe('reject');
    expect(result.errors[0]).toContain('otro código de barras');
  });

  it('completa el código de barras de un producto que no lo tenía', () => {
    const { rows, updates } = analyze([row('4006381333931', 'ALG-1', null, null, null, 500)]);
    expect(rows[0]).toMatchObject({ action: 'update', priceChanged: false, changedFields: ['Código de barras'] });
    expect(updates[0]!.details).toEqual({ barcode: '4006381333931' });
  });
});

describe('productos nuevos', () => {
  it('crea productos que no existen', () => {
    const { rows, creates } = analyze([row('4006381333931', 'SOL-50', 'Protector solar', 'Sunny', 'Dermo', '28.990')]);
    expect(rows[0]!.action).toBe('create');
    expect(creates[0]!.values).toMatchObject({ name: 'Protector solar', priceCents: 2_899_000, category: 'Dermo' });
  });

  it('rechaza productos nuevos sin nombre', () => {
    expect(analyze([row(null, 'NUEVO', null, null, null, 100)]).rows[0]!.errors[0]).toContain('sin nombre');
  });

  it('no crea productos si la opción está desactivada', () => {
    const result = analyze([row(null, 'NUEVO', 'Nuevo', null, null, 100)], { createNew: false }).rows[0]!;
    expect(result.action).toBe('reject');
    expect(result.errors[0]).toContain('desactivada');
  });
});

describe('validación de filas', () => {
  it.each([
    [row('7791234567890', null, 'X', null, null, 100), 'dígito verificador'],
    [row(null, null, 'Sin códigos', null, null, 100), 'Falta el código de barras o el código interno'],
    [row(null, 'A', 'X', null, null, null), 'Precio: Falta el precio'],
    [row(null, 'A', 'X', null, null, 'abc'), 'Precio:'],
    [row(null, 'A', 'X'.repeat(201), null, null, 100), 'máximo 200'],
  ])('rechaza filas inválidas (%#)', (input, message) => {
    const result = analyze([input]).rows[0]!;
    expect(result.action).toBe('reject');
    expect(result.errors.join(' ')).toContain(message);
  });

  it('ignora filas completamente vacías', () => {
    const { rows } = analyze([row(null, null, null, null, null, null), row(null, '  ', null, null, null, '')]);
    expect(rows).toHaveLength(0);
  });

  it('muestra los datos de la fila aunque sea rechazada', () => {
    expect(analyze([row(null, 'A', 'Producto X', null, null, 'abc')]).rows[0]).toMatchObject({
      name: 'Producto X',
      sku: 'A',
    });
  });
});

describe('duplicados dentro del archivo', () => {
  it('con el mismo precio usa la primera fila y rechaza las demás', () => {
    const { rows } = analyze([
      row('7791234567898', null, null, null, null, 1200),
      row('7791234567898', null, null, null, null, 1200),
    ]);
    expect(rows.map((r) => r.action)).toEqual(['update', 'reject']);
    expect(rows[1]!.errors[0]).toContain('Repetido');
  });

  it('con precios distintos rechaza todas las apariciones', () => {
    const { rows } = analyze([
      row(null, 'ALG-1', null, null, null, 600),
      row(null, 'ALG-1', null, null, null, 700),
    ]);
    expect(rows.map((r) => r.action)).toEqual(['reject', 'reject']);
    expect(rows[0]!.errors[0]).toContain('precios distintos');
  });
});

describe('actualización de otros datos (sin perder información)', () => {
  it('por defecto no reemplaza datos existentes pero completa los vacíos', () => {
    const { rows, updates } = analyze([row(null, 'ALG-1', 'ALGODON 500G', 'Estrella', 'Perfumería', 500)]);
    expect(rows[0]).toMatchObject({ action: 'update', changedFields: ['Marca / laboratorio', 'Categoría'] });
    expect(updates[0]!.details).toEqual({ brand: 'Estrella', category: 'Perfumería' });
  });

  it('con la opción activada reemplaza nombre y marca', () => {
    const { updates } = analyze([row('7791234567898', null, 'IBUPROFENO 400', 'Bayer', null, 1000)], {
      updateDetails: true,
    });
    expect(updates[0]!.details).toEqual({ name: 'IBUPROFENO 400', brand: 'Bayer' });
  });

  it('una celda vacía nunca borra un dato', () => {
    const { rows } = analyze([row('7791234567898', null, '', null, null, 1000)], { updateDetails: true });
    expect(rows[0]!.action).toBe('unchanged');
  });

  it('la misma categoría escrita distinto no cuenta como cambio', () => {
    const { rows } = analyze([row('7791234567898', null, null, null, 'ANALGESICOS', 1000)], { updateDetails: true });
    expect(rows[0]!.action).toBe('unchanged');
  });
});

describe('advertencias', () => {
  it('avisa variaciones de precio mayores al 50 %', () => {
    const { rows, summary } = analyze([row('7791234567898', null, null, null, null, 100_000)]);
    expect(rows[0]!.warnings[0]).toContain('Variación grande');
    expect(summary.withWarnings).toBe(1);
  });

  it('avisa precio cero y productos inactivos', () => {
    const inactive = { ...algodon, active: false };
    const warnings = analyze([row(null, 'ALG-1', null, null, null, 0)], {}, [inactive]).rows[0]!.warnings;
    expect(warnings.join(' ')).toContain('$ 0,00');
    expect(warnings.join(' ')).toContain('inactivo');
  });
});
