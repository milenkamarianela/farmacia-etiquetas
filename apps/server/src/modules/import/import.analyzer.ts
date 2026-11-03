import {
  type CellValue,
  type ColumnMapping,
  IMPORT_FIELD_LABELS,
  type ImportOptions,
  type ImportRow,
  type ImportRowResult,
  type ImportSummary,
  LARGE_PRICE_CHANGE_PERCENT,
  extractRowValues,
  formatARS,
  normalizeSearchText,
  parsePriceToCents,
  validateBarcode,
} from '@etiquetas/shared';

/** Datos del catálogo actual que necesita el análisis. */
export interface ExistingProduct {
  id: number;
  barcode: string | null;
  sku: string | null;
  name: string;
  brand: string | null;
  presentation: string | null;
  category: string | null;
  priceCents: number;
  active: boolean;
}

type DetailField = 'barcode' | 'sku' | 'name' | 'brand' | 'presentation' | 'category';

export interface ProductValues {
  barcode: string | null;
  sku: string | null;
  name: string | null;
  brand: string | null;
  presentation: string | null;
  category: string | null;
  priceCents: number;
}

export interface PlannedCreate {
  rowNumber: number;
  values: ProductValues & { name: string };
}

export interface PlannedUpdate {
  rowNumber: number;
  product: ExistingProduct;
  /** Solo los datos que cambian (sin el precio). */
  details: Partial<Record<DetailField, string>>;
  newPriceCents: number | null;
}

export interface AnalysisResult {
  rows: ImportRowResult[];
  summary: ImportSummary;
  creates: PlannedCreate[];
  updates: PlannedUpdate[];
}

const TEXT_LIMITS: Record<Exclude<DetailField, 'barcode'>, number> = {
  sku: 50,
  name: 200,
  brand: 100,
  presentation: 100,
  category: 100,
};

interface ParsedRow {
  rowNumber: number;
  values: ProductValues | null;
  /** Valores para mostrar aunque la fila tenga errores. */
  display: { name: string | null; barcode: string | null; sku: string | null; priceCents: number | null };
  errors: string[];
}

function cellText(value: CellValue): string | null {
  if (value === null) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

/** Valida una fila: formato de códigos, precio y longitudes. No consulta el catálogo. */
function parseRow(row: ImportRow, mapping: ColumnMapping): ParsedRow | null {
  const raw = extractRowValues(row.cells, mapping);
  if (Object.values(raw).every((value) => cellText(value) === null)) return null; // fila vacía

  const errors: string[] = [];
  const text = {} as Record<Exclude<DetailField, 'barcode'>, string | null>;
  for (const field of Object.keys(TEXT_LIMITS) as (keyof typeof TEXT_LIMITS)[]) {
    const value = cellText(raw[field]);
    if (value !== null && value.length > TEXT_LIMITS[field]) {
      errors.push(`${IMPORT_FIELD_LABELS[field]}: máximo ${TEXT_LIMITS[field]} caracteres`);
    }
    text[field] = value;
  }

  let barcode: string | null = null;
  const rawBarcode = cellText(raw.barcode);
  if (rawBarcode !== null) {
    const result = validateBarcode(typeof raw.barcode === 'number' ? raw.barcode : rawBarcode);
    if (result.ok) barcode = result.value;
    else errors.push(`Código de barras: ${result.error}`);
  }
  if (rawBarcode === null && text.sku === null) {
    errors.push('Falta el código de barras o el código interno');
  }

  let priceCents: number | null = null;
  const price = parsePriceToCents(typeof raw.price === 'number' ? raw.price : (cellText(raw.price) ?? ''));
  if (price.ok) priceCents = price.cents;
  else errors.push(`Precio: ${price.error}`);

  const display = { name: text.name, barcode: barcode ?? rawBarcode, sku: text.sku, priceCents };
  if (errors.length > 0 || priceCents === null) return { rowNumber: row.rowNumber, values: null, display, errors };
  return {
    rowNumber: row.rowNumber,
    values: { ...text, barcode, priceCents },
    display,
    errors,
  };
}

/** Marca las filas repetidas dentro del mismo archivo (mismo código de barras o código interno). */
function markDuplicates(rows: ParsedRow[]): void {
  const groups = new Map<string, ParsedRow[]>();
  for (const row of rows) {
    if (!row.values) continue;
    const keys = [row.values.barcode && `b:${row.values.barcode}`, row.values.sku && `s:${row.values.sku}`];
    for (const key of keys) {
      if (!key) continue;
      const group = groups.get(key) ?? [];
      group.push(row);
      groups.set(key, group);
    }
  }

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const rowList = group.map((r) => r.rowNumber).join(', ');
    const samePrice = new Set(group.map((r) => r.values?.priceCents)).size === 1;
    // Mismo precio: se usa la primera aparición. Precios distintos: no se puede saber cuál es el correcto.
    const rejected = samePrice ? group.slice(1) : group;
    for (const row of rejected) {
      const message = samePrice
        ? `Repetido en el archivo (filas ${rowList}); se usa la fila ${group[0]!.rowNumber}`
        : `Aparece varias veces con precios distintos (filas ${rowList})`;
      if (!row.errors.includes(message)) row.errors.push(message);
      row.values = null;
    }
  }
}

function priceVariationWarning(oldCents: number, newCents: number): string | null {
  if (oldCents === 0) return null;
  const percent = ((newCents - oldCents) / oldCents) * 100;
  if (Math.abs(percent) <= LARGE_PRICE_CHANGE_PERCENT) return null;
  const sign = percent > 0 ? '+' : '';
  return `Variación grande de precio (${sign}${Math.round(percent)} %): ${formatARS(oldCents)} → ${formatARS(newCents)}`;
}

const sameText = (a: string | null, b: string | null) =>
  (a === null ? null : normalizeSearchText(a)) === (b === null ? null : normalizeSearchText(b));

/**
 * Decide qué pasa con cada fila del archivo comparándola con el catálogo actual.
 * Es una función pura: no lee ni escribe la base. La misma función se usa para la
 * vista previa y para confirmar, así lo que se muestra es exactamente lo que se aplica.
 */
export function analyzeImport(
  rows: ImportRow[],
  mapping: ColumnMapping,
  options: ImportOptions,
  existing: ExistingProduct[],
): AnalysisResult {
  const byBarcode = new Map(existing.filter((p) => p.barcode).map((p) => [p.barcode!, p]));
  const bySku = new Map(existing.filter((p) => p.sku).map((p) => [p.sku!, p]));

  const parsed = rows.map((row) => parseRow(row, mapping)).filter((row): row is ParsedRow => row !== null);
  markDuplicates(parsed);

  const results: ImportRowResult[] = [];
  const creates: PlannedCreate[] = [];
  const updates: PlannedUpdate[] = [];

  for (const row of parsed) {
    const result: ImportRowResult = {
      rowNumber: row.rowNumber,
      action: 'reject',
      productId: null,
      name: row.display.name,
      barcode: row.display.barcode,
      sku: row.display.sku,
      oldPriceCents: null,
      newPriceCents: row.display.priceCents,
      priceChanged: false,
      changedFields: [],
      errors: [...row.errors],
      warnings: [],
    };
    results.push(result);
    const values = row.values;
    if (!values) continue;

    // Identificación: primero por código de barras, si no por código interno.
    const matchByBarcode = values.barcode ? byBarcode.get(values.barcode) : undefined;
    const matchBySku = values.sku ? bySku.get(values.sku) : undefined;
    const product = matchByBarcode ?? matchBySku;

    if (matchByBarcode && matchBySku && matchByBarcode.id !== matchBySku.id) {
      result.errors.push(
        `El código de barras corresponde a «${matchByBarcode.name}» pero el código interno a «${matchBySku.name}»`,
      );
      continue;
    }
    if (!matchByBarcode && matchBySku && values.barcode && matchBySku.barcode) {
      result.errors.push(
        `El código interno ${values.sku} pertenece a «${matchBySku.name}», que tiene otro código de barras (${matchBySku.barcode})`,
      );
      continue;
    }

    if (product) {
      result.productId = product.id;
      result.name = product.name;
      result.oldPriceCents = product.priceCents;

      const details: PlannedUpdate['details'] = {};
      // Los códigos y los datos vacíos del catálogo se completan siempre: no se pierde nada.
      if (values.barcode && !product.barcode) details.barcode = values.barcode;
      if (values.sku && !product.sku) details.sku = values.sku;
      for (const field of ['name', 'brand', 'presentation', 'category'] as const) {
        const incoming = values[field];
        if (incoming === null) continue; // una celda vacía nunca borra un dato
        const current = product[field];
        if (current === incoming) continue;
        if (current === null) {
          details[field] = incoming;
          continue;
        }
        if (!options.updateDetails) continue;
        // "Analgésicos" y "ANALGESICOS" son la misma categoría: no cuenta como cambio.
        if (field === 'category' && sameText(current, incoming)) continue;
        details[field] = incoming;
      }

      const priceChanged = values.priceCents !== product.priceCents;
      result.priceChanged = priceChanged;
      result.changedFields = Object.keys(details).map((f) => IMPORT_FIELD_LABELS[f as DetailField]);
      result.action = priceChanged || result.changedFields.length > 0 ? 'update' : 'unchanged';
      if (details.name) result.name = details.name;

      if (priceChanged) {
        const warning = priceVariationWarning(product.priceCents, values.priceCents);
        if (warning) result.warnings.push(warning);
      }
      if (values.priceCents === 0) result.warnings.push('El precio es $ 0,00');
      if (!product.active) result.warnings.push('El producto está inactivo: se actualiza pero sigue inactivo');

      if (result.action === 'update') {
        updates.push({
          rowNumber: row.rowNumber,
          product,
          details,
          newPriceCents: priceChanged ? values.priceCents : null,
        });
      }
      continue;
    }

    // Producto nuevo.
    if (!options.createNew) {
      result.errors.push('No existe en el catálogo (la creación de productos nuevos está desactivada)');
      continue;
    }
    if (!values.name) {
      result.errors.push('Producto nuevo sin nombre: asociá la columna del nombre o cargalo a mano');
      continue;
    }
    if (values.priceCents === 0) result.warnings.push('El precio es $ 0,00');
    result.action = 'create';
    creates.push({ rowNumber: row.rowNumber, values: { ...values, name: values.name } });
  }

  const summary: ImportSummary = {
    totalRows: results.length,
    create: results.filter((r) => r.action === 'create').length,
    update: results.filter((r) => r.action === 'update').length,
    priceChanged: results.filter((r) => r.priceChanged).length,
    unchanged: results.filter((r) => r.action === 'unchanged').length,
    reject: results.filter((r) => r.action === 'reject').length,
    withWarnings: results.filter((r) => r.action !== 'reject' && r.warnings.length > 0).length,
  };
  return { rows: results, summary, creates, updates };
}
