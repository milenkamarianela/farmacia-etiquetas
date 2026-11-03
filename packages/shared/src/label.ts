import { z } from 'zod';

/**
 * Configuración visual de una plantilla de etiqueta.
 * Se guarda como JSON en la base y lleva `version` para poder migrarla
 * cuando exista el diseñador visual de etiquetas.
 */
export const labelTemplateConfigSchema = z.object({
  version: z.literal(1),
  /** Hoja donde se acomodan las etiquetas en grilla (por defecto A4 vertical). */
  sheet: z.object({
    pageWidthMm: z.number().positive().max(1000).default(210),
    pageHeightMm: z.number().positive().max(1000).default(297),
    marginTopMm: z.number().min(0).default(10),
    marginLeftMm: z.number().min(0).default(10),
    gapXMm: z.number().min(0).default(2),
    gapYMm: z.number().min(0).default(2),
  }),
  fields: z.object({
    showBrand: z.boolean().default(true),
    showPresentation: z.boolean().default(true),
    showBarcode: z.boolean().default(true),
    showSku: z.boolean().default(true),
    showPharmacyName: z.boolean().default(false),
  }),
  style: z.object({
    nameFontSizePt: z.number().min(4).max(72).default(9),
    priceFontSizePt: z.number().min(6).max(144).default(22),
    /** Dibuja el borde de cada etiqueta como guía de corte. */
    showCutGuides: z.boolean().default(true),
  }),
});

export type LabelTemplateConfig = z.output<typeof labelTemplateConfigSchema>;

export const labelTemplateInputSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es obligatorio').max(100),
  widthMm: z.number().min(10, 'Mínimo 10 mm').max(300, 'Máximo 300 mm'),
  heightMm: z.number().min(10, 'Mínimo 10 mm').max(300, 'Máximo 300 mm'),
  config: labelTemplateConfigSchema,
});

export type LabelTemplateInput = z.input<typeof labelTemplateInputSchema>;

export interface LabelPosition {
  xMm: number;
  yMm: number;
}

export interface SheetLayout {
  columns: number;
  rows: number;
  perPage: number;
  /** Esquina superior izquierda de cada etiqueta de la hoja, en orden de lectura. */
  positions: LabelPosition[];
}

/** Calcula cuántas etiquetas entran en la hoja y dónde va cada una, en milímetros. */
export function computeSheetLayout(
  widthMm: number,
  heightMm: number,
  sheet: LabelTemplateConfig['sheet'],
): SheetLayout {
  const usableWidth = sheet.pageWidthMm - sheet.marginLeftMm * 2;
  const usableHeight = sheet.pageHeightMm - sheet.marginTopMm * 2;
  // Se suma un espacio extra porque la última columna/fila no lleva separación a continuación.
  const columns = Math.floor((usableWidth + sheet.gapXMm) / (widthMm + sheet.gapXMm));
  const rows = Math.floor((usableHeight + sheet.gapYMm) / (heightMm + sheet.gapYMm));

  if (columns < 1 || rows < 1) {
    throw new Error(
      `La etiqueta de ${widthMm} × ${heightMm} mm no entra en la hoja con los márgenes configurados`,
    );
  }

  const positions: LabelPosition[] = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      positions.push({
        xMm: round(sheet.marginLeftMm + column * (widthMm + sheet.gapXMm)),
        yMm: round(sheet.marginTopMm + row * (heightMm + sheet.gapYMm)),
      });
    }
  }
  return { columns, rows, perPage: columns * rows, positions };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Plantilla inicial que se crea al preparar la base de datos. */
export const DEFAULT_LABEL_TEMPLATE: z.output<typeof labelTemplateInputSchema> = {
  name: 'Góndola estándar 60 × 35 mm',
  widthMm: 60,
  heightMm: 35,
  config: labelTemplateConfigSchema.parse({ version: 1, sheet: {}, fields: {}, style: {} }),
};
