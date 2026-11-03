import { describe, expect, it } from 'vitest';
import { DEFAULT_LABEL_TEMPLATE, computeSheetLayout, labelTemplateConfigSchema } from './label.js';

const sheet = DEFAULT_LABEL_TEMPLATE.config.sheet;

describe('computeSheetLayout', () => {
  it('ubica la plantilla estándar 60×35 mm en A4 (3 columnas × 7 filas)', () => {
    const layout = computeSheetLayout(60, 35, sheet);
    expect(layout).toMatchObject({ columns: 3, rows: 7, perPage: 21 });
    expect(layout.positions[0]).toEqual({ xMm: 10, yMm: 10 });
    expect(layout.positions[1]).toEqual({ xMm: 72, yMm: 10 });
    expect(layout.positions[3]).toEqual({ xMm: 10, yMm: 47 });
  });

  it('ninguna etiqueta se sale de la hoja', () => {
    for (const [w, h] of [[60, 35], [38, 21.2], [100, 50], [190, 277]] as const) {
      const layout = computeSheetLayout(w, h, sheet);
      for (const p of layout.positions) {
        expect(p.xMm + w).toBeLessThanOrEqual(sheet.pageWidthMm - sheet.marginLeftMm + 1e-9);
        expect(p.yMm + h).toBeLessThanOrEqual(sheet.pageHeightMm - sheet.marginTopMm + 1e-9);
      }
    }
  });

  it('falla con un mensaje claro si la etiqueta no entra', () => {
    expect(() => computeSheetLayout(200, 35, sheet)).toThrow('no entra en la hoja');
  });
});

describe('labelTemplateConfigSchema', () => {
  it('completa valores por defecto', () => {
    const config = labelTemplateConfigSchema.parse({ version: 1, sheet: {}, fields: {}, style: {} });
    expect(config.sheet.pageWidthMm).toBe(210);
    expect(config.fields.showBarcode).toBe(true);
  });

  it('rechaza versiones desconocidas', () => {
    expect(labelTemplateConfigSchema.safeParse({ version: 2, sheet: {}, fields: {}, style: {} }).success).toBe(false);
  });
});
