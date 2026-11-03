import type { Prisma } from '@prisma/client';
import {
  type Paginated,
  type PriceChangeListItem,
  normalizeSearchText,
  priceChangeQuerySchema,
} from '@etiquetas/shared';
import { Router } from 'express';
import type { z } from 'zod';
import { prisma } from '../../db.js';
import { toPriceChangeDto } from '../products/products.service.js';

type PriceChangeQuery = z.output<typeof priceChangeQuerySchema>;

/** "2026-11-03" → inicio de ese día en la hora local de la PC (la farmacia y el servidor están en el mismo lugar). */
const startOfLocalDay = (date: string) => new Date(`${date}T00:00:00`);

function buildWhere(query: PriceChangeQuery): Prisma.PriceChangeWhereInput {
  const and: Prisma.PriceChangeWhereInput[] = [];
  // "Cambios" = había un precio anterior (excluye altas, incluso las creadas por una importación).
  if (query.source === 'changes') and.push({ source: { in: ['MANUAL', 'IMPORT'] }, oldPriceCents: { not: null } });
  else if (query.source !== 'all') and.push({ source: query.source });
  if (query.importBatchId) and.push({ importBatchId: query.importBatchId });
  if (query.from) and.push({ changedAt: { gte: startOfLocalDay(query.from) } });
  if (query.to) {
    const end = startOfLocalDay(query.to);
    end.setDate(end.getDate() + 1);
    and.push({ changedAt: { lt: end } });
  }
  if (query.search) {
    for (const word of normalizeSearchText(query.search).split(' ').filter(Boolean)) {
      and.push({ product: { searchText: { contains: word } } });
    }
  }
  return { AND: and };
}

const include = {
  product: { select: { name: true, barcode: true, sku: true } },
  importBatch: { select: { fileName: true } },
} satisfies Prisma.PriceChangeInclude;

export async function listPriceChanges(query: PriceChangeQuery): Promise<Paginated<PriceChangeListItem>> {
  const where = buildWhere(query);
  const [total, rows] = await Promise.all([
    prisma.priceChange.count({ where }),
    prisma.priceChange.findMany({
      where,
      include,
      orderBy: [{ changedAt: 'desc' }, { id: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);
  return {
    items: rows.map((row) => ({
      ...toPriceChangeDto(row),
      productName: row.product.name,
      productBarcode: row.product.barcode,
      productSku: row.product.sku,
      importFileName: row.importBatch?.fileName ?? null,
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export const priceChangesRouter = Router();

priceChangesRouter.get('/', async (req, res) => {
  res.json(await listPriceChanges(priceChangeQuerySchema.parse(req.query)));
});
