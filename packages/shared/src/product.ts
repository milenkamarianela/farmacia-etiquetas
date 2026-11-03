import { z } from 'zod';
import { validateBarcode } from './barcode.js';
import { MAX_PRICE_CENTS } from './money.js';

/** Texto opcional: recorta espacios y convierte vacío en null. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .nullish()
    .transform((value) => (value ? value : null));

export const productInputSchema = z
  .object({
    barcode: optionalText(32).transform((value, ctx) => {
      if (value === null) return null;
      const result = validateBarcode(value);
      if (!result.ok) {
        ctx.addIssue({ code: 'custom', message: result.error });
        return z.NEVER;
      }
      return result.value;
    }),
    sku: optionalText(50),
    name: z.string().trim().min(1, 'El nombre es obligatorio').max(200, 'Máximo 200 caracteres'),
    brand: optionalText(100),
    presentation: optionalText(100),
    category: optionalText(100),
    priceCents: z
      .number({ error: 'El precio es obligatorio' })
      .int('El precio debe estar en centavos enteros')
      .min(0, 'El precio no puede ser negativo')
      .max(MAX_PRICE_CENTS, 'El precio supera el máximo permitido'),
    active: z.boolean().default(true),
  })
  .refine((product) => product.barcode !== null || product.sku !== null, {
    message: 'Ingresá el código de barras o el código interno',
    path: ['barcode'],
  });

export type ProductInput = z.input<typeof productInputSchema>;
export type ProductData = z.output<typeof productInputSchema>;

/** Estado de la etiqueta de góndola respecto del precio actual. */
export type LabelStatus = 'never' | 'outdated' | 'current';

/** Producto tal como lo expone la API (montos en centavos como number). */
export interface ProductDto {
  id: number;
  barcode: string | null;
  sku: string | null;
  name: string;
  brand: string | null;
  presentation: string | null;
  categoryId: number | null;
  category: string | null;
  priceCents: number;
  priceUpdatedAt: string;
  active: boolean;
  lastPrintedPriceCents: number | null;
  lastPrintedAt: string | null;
  labelStatus: LabelStatus;
}

export function getLabelStatus(priceCents: number, lastPrintedPriceCents: number | null): LabelStatus {
  if (lastPrintedPriceCents === null) return 'never';
  return lastPrintedPriceCents === priceCents ? 'current' : 'outdated';
}

/** Orígenes posibles de un cambio de precio. */
export const PRICE_CHANGE_SOURCES = ['CREATE', 'MANUAL', 'IMPORT'] as const;
export type PriceChangeSource = (typeof PRICE_CHANGE_SOURCES)[number];

export interface PriceChangeDto {
  id: number;
  productId: number;
  oldPriceCents: number | null;
  newPriceCents: number;
  changedAt: string;
  source: PriceChangeSource;
  importBatchId: number | null;
}

export interface CategoryDto {
  id: number;
  name: string;
  productCount: number;
}

/** Minúsculas y sin acentos: "Algodón HIDRÓFILO" → "algodon hidrofilo". */
export function normalizeSearchText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Texto en el que se busca: todos los datos identificatorios del producto juntos. */
export function buildProductSearchText(product: {
  name: string;
  brand?: string | null;
  presentation?: string | null;
  sku?: string | null;
  barcode?: string | null;
}): string {
  return normalizeSearchText(
    [product.name, product.brand, product.presentation, product.sku, product.barcode].filter(Boolean).join(' '),
  );
}

export const productListQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  status: z.enum(['active', 'inactive', 'all']).default('active'),
  labelStatus: z.enum(['all', 'never', 'outdated', 'current']).default('all'),
  sort: z.enum(['name', 'price', 'priceUpdatedAt']).default('name'),
  order: z.enum(['asc', 'desc']).default('asc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export type ProductListQuery = z.input<typeof productListQuerySchema>;
export type ProductFilters = Omit<z.output<typeof productListQuerySchema>, 'page' | 'pageSize' | 'sort' | 'order'>;

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Máximo de productos que se pueden seleccionar de una vez con "seleccionar todos". */
export const MAX_BULK_SELECTION = 5000;

export const bulkStatusSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1, 'No hay productos seleccionados').max(MAX_BULK_SELECTION),
  active: z.boolean(),
});

export type BulkStatusInput = z.input<typeof bulkStatusSchema>;
