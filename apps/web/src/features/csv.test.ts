import { describe, expect, it } from 'vitest';
import type { ImportRowResult, PriceChangeListItem } from '@etiquetas/shared';
import { buildPriceChangesCsv } from './history/PriceChangesTab';
import { buildRejectedCsv } from './import/rejectedCsv';

const rejected = (rowNumber: number, errors: string[]): ImportRowResult => ({
  rowNumber,
  action: 'reject',
  productId: null,
  name: null,
  barcode: null,
  sku: null,
  oldPriceCents: null,
  newPriceCents: null,
  priceChanged: false,
  changedFields: [],
  errors,
  warnings: [],
});

describe('CSV de filas rechazadas', () => {
  it('incluye la fila original y el motivo, listo para corregir en Excel', () => {
    const csv = buildRejectedCsv(
      ['Código', 'Descripción', 'Precio'],
      [
        { rowNumber: 2, cells: ['A1', 'Crema "suave"; 50 g', 'abc'] },
        { rowNumber: 3, cells: ['A2', 'Bien', 100] },
      ],
      [rejected(2, ['Precio: "abc" no es un precio válido'])],
    );
    expect(csv.startsWith('﻿')).toBe(true);
    const lines = csv.slice(1).trim().split('\r\n');
    expect(lines).toEqual([
      'Fila;Código;Descripción;Precio;Motivo del rechazo',
      '2;A1;"Crema ""suave""; 50 g";abc;"Precio: ""abc"" no es un precio válido"',
    ]);
  });
});

describe('CSV del historial de precios', () => {
  it('usa coma decimal para que Excel en español lo lea como número', () => {
    const row: PriceChangeListItem = {
      id: 1,
      productId: 1,
      oldPriceCents: 1_245_000,
      newPriceCents: 1_350_050,
      changedAt: '2026-11-03T15:00:00Z',
      source: 'IMPORT',
      importBatchId: 4,
      productName: 'Ibuprofeno',
      productBarcode: '7791234567898',
      productSku: null,
      importFileName: 'lista.xlsx',
    };
    const [, line] = buildPriceChangesCsv([row]).slice(1).trim().split('\r\n');
    expect(line).toMatch(/;Ibuprofeno;7791234567898;;12450,00;13500,50;Importación;lista\.xlsx$/);
  });
});
