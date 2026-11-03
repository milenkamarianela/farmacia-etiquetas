import { describe, expect, it } from 'vitest';
import {
  EMPTY_MAPPING,
  columnLetter,
  extractRowValues,
  headersFromCells,
  suggestMapping,
  validateMapping,
} from './import.js';

describe('suggestMapping', () => {
  it('reconoce encabezados habituales con acentos, mayúsculas y signos', () => {
    expect(suggestMapping(['Código', 'DESCRIPCIÓN', 'Laboratorio', 'Cód. de barras', 'P.V.P.', 'Rubro'])).toEqual({
      sku: 0,
      name: 1,
      brand: 2,
      barcode: 3,
      price: 4,
      category: 5,
      presentation: null,
    });
  });

  it('no confunde "Código de barras" con el código interno', () => {
    const mapping = suggestMapping(['Codigo de barras', 'Nombre', 'Precio']);
    expect(mapping.barcode).toBe(0);
    expect(mapping.sku).toBeNull();
  });

  it('acepta encabezados que empiezan con el nombre del campo', () => {
    expect(suggestMapping(['EAN 13', 'Precio $ final']).barcode).toBe(0);
    expect(suggestMapping(['EAN 13', 'Precio $ final']).price).toBe(1);
  });

  it('deja sin asociar lo que no reconoce', () => {
    expect(suggestMapping(['Columna A', 'Stock'])).toEqual(EMPTY_MAPPING);
  });
});

describe('validateMapping', () => {
  it('exige precio y al menos un código', () => {
    expect(validateMapping(EMPTY_MAPPING)).toHaveLength(2);
    expect(validateMapping({ ...EMPTY_MAPPING, price: 1, sku: 0 })).toEqual([]);
  });

  it('detecta una columna asignada dos veces', () => {
    expect(validateMapping({ ...EMPTY_MAPPING, price: 1, sku: 1 })[0]).toContain('misma columna');
  });
});

describe('columnLetter y headersFromCells', () => {
  it('nombra columnas como Excel', () => {
    expect([0, 25, 26, 27, 701].map(columnLetter)).toEqual(['A', 'Z', 'AA', 'AB', 'ZZ']);
  });

  it('completa encabezados vacíos', () => {
    expect(headersFromCells(['Precio', null], 3)).toEqual(['Precio', 'Columna 2', 'Columna 3']);
  });
});

describe('extractRowValues', () => {
  it('toma solo las columnas asociadas y tolera filas cortas', () => {
    const values = extractRowValues(['A1', 'Ibuprofeno'], { ...EMPTY_MAPPING, sku: 0, name: 1, price: 5 });
    expect(values).toMatchObject({ sku: 'A1', name: 'Ibuprofeno', price: null, brand: null });
  });
});
