import { z } from 'zod';
import { normalizeSearchText } from './product.js';

/** Campos del producto que se pueden asociar a una columna del archivo. */
export const IMPORT_FIELDS = ['barcode', 'sku', 'name', 'brand', 'presentation', 'category', 'price'] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  barcode: 'Código de barras',
  sku: 'Código interno',
  name: 'Nombre',
  brand: 'Marca / laboratorio',
  presentation: 'Presentación',
  category: 'Categoría',
  price: 'Precio',
};

export const MAX_IMPORT_ROWS = 20_000;
export const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;
export const IMPORT_FILE_EXTENSIONS = ['.xlsx', '.csv', '.txt'] as const;

/** Una variación de precio mayor a este porcentaje genera una advertencia (posible error de carga). */
export const LARGE_PRICE_CHANGE_PERCENT = 50;

export const cellValueSchema = z.union([z.string().max(2000), z.number(), z.null()]);
export type CellValue = z.infer<typeof cellValueSchema>;

export const importRowSchema = z.object({
  /** Número de fila en el archivo original (para que el usuario la encuentre). */
  rowNumber: z.number().int().positive(),
  cells: z.array(cellValueSchema).max(500),
});
export type ImportRow = z.infer<typeof importRowSchema>;

/** Índice de columna (desde 0) asociado a cada campo, o null si no se usa. */
export const columnMappingSchema = z.object({
  barcode: z.number().int().min(0).nullable(),
  sku: z.number().int().min(0).nullable(),
  name: z.number().int().min(0).nullable(),
  brand: z.number().int().min(0).nullable(),
  presentation: z.number().int().min(0).nullable(),
  category: z.number().int().min(0).nullable(),
  price: z.number().int().min(0).nullable(),
});
export type ColumnMapping = z.infer<typeof columnMappingSchema>;

export const EMPTY_MAPPING: ColumnMapping = {
  barcode: null,
  sku: null,
  name: null,
  brand: null,
  presentation: null,
  category: null,
  price: null,
};

export const importOptionsSchema = z.object({
  /** Crear los productos que no existen en el catálogo. */
  createNew: z.boolean().default(true),
  /**
   * Reemplazar nombre, marca, presentación y categoría de productos existentes con los del archivo.
   * Si está desactivado solo se completan los datos que estaban vacíos (nunca se pisa información).
   */
  updateDetails: z.boolean().default(false),
});
export type ImportOptions = z.output<typeof importOptionsSchema>;

/** Problemas de una asociación de columnas que impiden analizar el archivo. */
export function validateMapping(mapping: ColumnMapping): string[] {
  const errors: string[] = [];
  if (mapping.price === null) errors.push('Elegí la columna del precio.');
  if (mapping.barcode === null && mapping.sku === null) {
    errors.push('Elegí la columna del código de barras o la del código interno (o ambas).');
  }
  const used = new Map<number, ImportField>();
  for (const field of IMPORT_FIELDS) {
    const column = mapping[field];
    if (column === null) continue;
    const other = used.get(column);
    if (other) {
      errors.push(`La misma columna está asignada a «${IMPORT_FIELD_LABELS[other]}» y a «${IMPORT_FIELD_LABELS[field]}».`);
    }
    used.set(column, field);
  }
  return errors;
}

export const importRequestSchema = z
  .object({
    fileName: z.string().trim().min(1).max(255),
    rows: z
      .array(importRowSchema)
      .min(1, 'El archivo no tiene filas para importar')
      .max(MAX_IMPORT_ROWS, `Se pueden importar hasta ${MAX_IMPORT_ROWS} filas por archivo`),
    mapping: columnMappingSchema,
    options: importOptionsSchema,
  })
  .superRefine((request, ctx) => {
    for (const message of validateMapping(request.mapping)) {
      ctx.addIssue({ code: 'custom', message, path: ['mapping'] });
    }
  });
export type ImportRequest = z.input<typeof importRequestSchema>;

/** Resultado de leer un archivo subido, antes de asociar columnas. */
export interface ParsedImportFile {
  fileName: string;
  sheetNames: string[];
  sheet: string | null;
  /** Fila del archivo tomada como encabezado (la primera con datos). */
  headerRowNumber: number;
  headers: string[];
  rows: ImportRow[];
  suggestedMapping: ColumnMapping;
}

export type ImportAction = 'create' | 'update' | 'unchanged' | 'reject';

export interface ImportRowResult {
  rowNumber: number;
  action: ImportAction;
  productId: number | null;
  name: string | null;
  barcode: string | null;
  sku: string | null;
  oldPriceCents: number | null;
  newPriceCents: number | null;
  priceChanged: boolean;
  /** Otros datos que se modifican (por ejemplo "Marca / laboratorio"). */
  changedFields: string[];
  errors: string[];
  warnings: string[];
}

export interface ImportSummary {
  totalRows: number;
  create: number;
  update: number;
  priceChanged: number;
  unchanged: number;
  reject: number;
  withWarnings: number;
}

export interface ImportAnalysis {
  summary: ImportSummary;
  rows: ImportRowResult[];
}

export interface ImportCommitResult {
  batchId: number;
  summary: ImportSummary;
  backupFile: string;
}

/** Nombres de columna habituales para cada campo (ya normalizados: minúsculas, sin acentos ni signos). */
const HEADER_SYNONYMS: Record<ImportField, string[]> = {
  barcode: ['codigo de barras', 'cod de barras', 'cod barras', 'codigo barras', 'codigo barra', 'codbarras', 'ean', 'ean13', 'barcode', 'gtin'],
  sku: ['codigo interno', 'cod interno', 'sku', 'codigo', 'cod', 'cod articulo', 'codigo articulo', 'id', 'troquel'],
  name: ['nombre', 'descripcion', 'producto', 'detalle', 'articulo', 'nombre producto'],
  brand: ['marca', 'laboratorio', 'lab', 'fabricante'],
  presentation: ['presentacion', 'present', 'contenido'],
  category: ['categoria', 'rubro', 'familia', 'seccion', 'grupo'],
  price: ['precio', 'pvp', 'p v p', 'precio venta', 'precio publico', 'precio de venta', 'importe', 'precio final', 'precio unitario'],
};

const normalizeHeader = (header: string) =>
  normalizeSearchText(header)
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Propone qué columna corresponde a cada campo según el encabezado. El usuario siempre puede corregirlo. */
export function suggestMapping(headers: string[]): ColumnMapping {
  const normalized = headers.map(normalizeHeader);
  const mapping: ColumnMapping = { ...EMPTY_MAPPING };
  const taken = new Set<number>();

  const assign = (match: (header: string, synonym: string) => boolean) => {
    for (const field of IMPORT_FIELDS) {
      if (mapping[field] !== null) continue;
      for (const synonym of HEADER_SYNONYMS[field]) {
        const index = normalized.findIndex((h, i) => !taken.has(i) && h !== '' && match(h, synonym));
        if (index !== -1) {
          mapping[field] = index;
          taken.add(index);
          break;
        }
      }
    }
  };

  // Primero coincidencias exactas; después encabezados que empiezan con un sinónimo ("Precio $", "EAN 13").
  assign((header, synonym) => header === synonym);
  assign((header, synonym) => header.startsWith(`${synonym} `));
  return mapping;
}

/** Nombres de columna a partir de una fila; las celdas vacías se llaman "Columna N". */
export function headersFromCells(cells: CellValue[], columnCount = cells.length): string[] {
  return Array.from({ length: columnCount }, (_, i) => {
    const value = cells[i];
    return value === null || value === undefined ? `Columna ${i + 1}` : String(value);
  });
}

/** Letra de columna estilo Excel: 0 → A, 25 → Z, 26 → AA. */
export function columnLetter(index: number): string {
  let letter = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    letter = String.fromCharCode(65 + ((n - 1) % 26)) + letter;
  }
  return letter;
}

/** Valores de las columnas asociadas en una fila. */
export function extractRowValues(cells: CellValue[], mapping: ColumnMapping): Record<ImportField, CellValue> {
  const values = {} as Record<ImportField, CellValue>;
  for (const field of IMPORT_FIELDS) {
    const column = mapping[field];
    values[field] = column === null ? null : (cells[column] ?? null);
  }
  return values;
}
