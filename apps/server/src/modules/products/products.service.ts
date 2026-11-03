import type { PriceChange, Prisma } from '@prisma/client';
import {
  MAX_BULK_SELECTION,
  type Paginated,
  type PriceChangeDto,
  type PriceChangeSource,
  type ProductData,
  type ProductDto,
  type ProductFilters,
  buildProductSearchText,
  getLabelStatus,
  normalizeSearchText,
  productListQuerySchema,
} from '@etiquetas/shared';
import type { z } from 'zod';
import { prisma } from '../../db.js';
import { HttpError, notFound } from '../../lib/errors.js';
import { resolveCategoryId } from '../categories/categories.service.js';
import { applyPriceChange, recordInitialPrice } from './price.js';

const productInclude = { category: { select: { name: true } } } satisfies Prisma.ProductInclude;
type ProductRow = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

export function toProductDto(row: ProductRow): ProductDto {
  const priceCents = Number(row.priceCents);
  const lastPrintedPriceCents = row.lastPrintedPriceCents === null ? null : Number(row.lastPrintedPriceCents);
  return {
    id: row.id,
    barcode: row.barcode,
    sku: row.sku,
    name: row.name,
    brand: row.brand,
    presentation: row.presentation,
    categoryId: row.categoryId,
    category: row.category?.name ?? null,
    priceCents,
    priceUpdatedAt: row.priceUpdatedAt.toISOString(),
    active: row.active,
    lastPrintedPriceCents,
    lastPrintedAt: row.lastPrintedAt?.toISOString() ?? null,
    labelStatus: getLabelStatus(priceCents, lastPrintedPriceCents),
  };
}

/** Condición de "etiqueta desactualizada": se imprimió alguna vez y con otro precio. */
export const outdatedLabelWhere = (): Prisma.ProductWhereInput => ({
  lastPrintedPriceCents: { not: null },
  NOT: { priceCents: { equals: prisma.product.fields.lastPrintedPriceCents } },
});

function buildWhere(filters: ProductFilters): Prisma.ProductWhereInput {
  const and: Prisma.ProductWhereInput[] = [];
  if (filters.status !== 'all') and.push({ active: filters.status === 'active' });
  if (filters.categoryId) and.push({ categoryId: filters.categoryId });
  if (filters.search) {
    // Cada palabra tiene que aparecer, en cualquier orden: "ibu 400" encuentra "Ibuprofeno 400 mg".
    for (const word of normalizeSearchText(filters.search).split(' ').filter(Boolean)) {
      and.push({ searchText: { contains: word } });
    }
  }
  switch (filters.labelStatus) {
    case 'never':
      and.push({ lastPrintedPriceCents: null });
      break;
    case 'outdated':
      and.push(outdatedLabelWhere());
      break;
    case 'current':
      and.push({ priceCents: { equals: prisma.product.fields.lastPrintedPriceCents } });
      break;
  }
  return { AND: and };
}

const ORDER_FIELDS = { name: 'name', price: 'priceCents', priceUpdatedAt: 'priceUpdatedAt' } as const;

export async function listProducts(
  query: z.output<typeof productListQuerySchema>,
): Promise<Paginated<ProductDto>> {
  const where = buildWhere(query);
  const [total, rows] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      include: productInclude,
      orderBy: [{ [ORDER_FIELDS[query.sort]]: query.order }, { id: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);
  return { items: rows.map(toProductDto), total, page: query.page, pageSize: query.pageSize };
}

/** Ids de todos los productos que cumplen los filtros (para "seleccionar todos"). */
export async function listProductIds(filters: ProductFilters): Promise<number[]> {
  const where = buildWhere(filters);
  const total = await prisma.product.count({ where });
  if (total > MAX_BULK_SELECTION) {
    throw new HttpError(
      400,
      `Hay ${total} productos con esos filtros; se pueden seleccionar hasta ${MAX_BULK_SELECTION} a la vez. Filtrá un poco más.`,
    );
  }
  const rows = await prisma.product.findMany({ where, select: { id: true }, orderBy: { name: 'asc' } });
  return rows.map((r) => r.id);
}

/** Productos por id, en el mismo orden pedido (los inexistentes se omiten). */
export async function getProductsByIds(ids: number[]): Promise<ProductDto[]> {
  const rows = await prisma.product.findMany({ where: { id: { in: ids } }, include: productInclude });
  const byId = new Map(rows.map((row) => [row.id, toProductDto(row)]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}

export async function getProduct(id: number): Promise<ProductDto> {
  const row = await prisma.product.findUnique({ where: { id }, include: productInclude });
  if (!row) throw notFound('El producto');
  return toProductDto(row);
}

function productFields(data: ProductData, categoryId: number | null) {
  return {
    barcode: data.barcode,
    sku: data.sku,
    name: data.name,
    brand: data.brand,
    presentation: data.presentation,
    categoryId,
    active: data.active,
    searchText: buildProductSearchText(data),
  };
}

export async function createProduct(data: ProductData): Promise<ProductDto> {
  const id = await prisma.$transaction(async (tx) => {
    const categoryId = await resolveCategoryId(tx, data.category);
    const priceCents = BigInt(data.priceCents);
    const product = await tx.product.create({ data: { ...productFields(data, categoryId), priceCents } });
    await recordInitialPrice(tx, product.id, priceCents);
    return product.id;
  });
  return getProduct(id);
}

export async function updateProduct(
  id: number,
  data: ProductData,
  source: PriceChangeSource = 'MANUAL',
): Promise<ProductDto> {
  await prisma.$transaction(async (tx) => {
    const current = await tx.product.findUnique({ where: { id }, select: { id: true, priceCents: true } });
    if (!current) throw notFound('El producto');
    const categoryId = await resolveCategoryId(tx, data.category);
    await tx.product.update({ where: { id }, data: productFields(data, categoryId) });
    await applyPriceChange(tx, current, BigInt(data.priceCents), source);
  });
  return getProduct(id);
}

export async function setProductsActive(ids: number[], active: boolean): Promise<number> {
  const result = await prisma.product.updateMany({ where: { id: { in: ids } }, data: { active } });
  return result.count;
}

export async function listPriceChanges(productId: number, limit = 50): Promise<PriceChangeDto[]> {
  const exists = await prisma.product.count({ where: { id: productId } });
  if (!exists) throw notFound('El producto');
  const rows = await prisma.priceChange.findMany({
    where: { productId },
    orderBy: [{ changedAt: 'desc' }, { id: 'desc' }],
    take: limit,
  });
  return rows.map(toPriceChangeDto);
}

export function toPriceChangeDto(row: PriceChange): PriceChangeDto {
  return {
    id: row.id,
    productId: row.productId,
    oldPriceCents: row.oldPriceCents === null ? null : Number(row.oldPriceCents),
    newPriceCents: Number(row.newPriceCents),
    changedAt: row.changedAt.toISOString(),
    source: row.source as PriceChangeSource,
    importBatchId: row.importBatchId,
  };
}
