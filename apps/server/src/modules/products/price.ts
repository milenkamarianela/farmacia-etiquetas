import type { Prisma } from '@prisma/client';
import type { PriceChangeSource } from '@etiquetas/shared';

type Tx = Prisma.TransactionClient;

/**
 * Cambia el precio de un producto y deja registro en el historial.
 * Si el precio es el mismo no hace nada (no se registran cambios innecesarios).
 * Debe llamarse dentro de una transacción junto con el resto de la actualización.
 *
 * @returns true si el precio cambió.
 */
export async function applyPriceChange(
  tx: Tx,
  product: { id: number; priceCents: bigint },
  newPriceCents: bigint,
  source: PriceChangeSource,
  importBatchId: number | null = null,
): Promise<boolean> {
  if (product.priceCents === newPriceCents) return false;

  const now = new Date();
  await tx.product.update({
    where: { id: product.id },
    data: { priceCents: newPriceCents, priceUpdatedAt: now },
  });
  await tx.priceChange.create({
    data: {
      productId: product.id,
      oldPriceCents: product.priceCents,
      newPriceCents,
      source,
      importBatchId,
      changedAt: now,
    },
  });
  return true;
}

/** Registra el precio con el que se da de alta un producto (precio anterior vacío). */
export async function recordInitialPrice(
  tx: Tx,
  productId: number,
  priceCents: bigint,
  importBatchId: number | null = null,
): Promise<void> {
  await tx.priceChange.create({
    data: {
      productId,
      oldPriceCents: null,
      newPriceCents: priceCents,
      source: importBatchId === null ? 'CREATE' : 'IMPORT',
      importBatchId,
    },
  });
}
