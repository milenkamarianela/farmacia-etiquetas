import { z } from 'zod';
import type { PriceChangeDto } from './product.js';

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha con formato AAAA-MM-DD')
  .optional()
  .or(z.literal('').transform(() => undefined));

/** Filtros del historial de precios. "changes" = precios que cambiaron (sin altas de productos). */
export const priceChangeQuerySchema = z
  .object({
    search: z.string().trim().max(100).optional(),
    source: z.enum(['changes', 'all', 'CREATE', 'MANUAL', 'IMPORT']).default('changes'),
    importBatchId: z.coerce.number().int().positive().optional(),
    from: dateSchema,
    to: dateSchema,
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(200).default(50),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, { message: 'La fecha "desde" es posterior a "hasta"', path: ['from'] });

export type PriceChangeQuery = z.input<typeof priceChangeQuerySchema>;

export interface PriceChangeListItem extends PriceChangeDto {
  productName: string;
  productBarcode: string | null;
  productSku: string | null;
  importFileName: string | null;
}

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type PaginationQuery = z.input<typeof paginationQuerySchema>;

export interface PrintJobItemDto {
  productId: number;
  name: string;
  quantity: number;
  /** Precio que quedó impreso. */
  priceCents: number;
  /** Precio actual del producto (para ver si la etiqueta ya quedó vieja). */
  currentPriceCents: number;
}

export interface PrintJobDetail {
  id: number;
  createdAt: string;
  templateName: string;
  widthMm: number;
  heightMm: number;
  labelCount: number;
  startPosition: number;
  items: PrintJobItemDto[];
}

export interface BackupStatus {
  lastBackupAt: string | null;
  count: number;
  directory: string;
}
