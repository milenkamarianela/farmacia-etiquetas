import type { Prisma } from '@prisma/client';
import {
  type ImportAnalysis,
  type ImportBatchSummary,
  type ImportCommitResult,
  type ImportSummary,
  buildProductSearchText,
  importRequestSchema,
} from '@etiquetas/shared';
import type { z } from 'zod';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { HttpError } from '../../lib/errors.js';
import { createBackup } from '../backup/backup.service.js';
import { createCategoryResolver } from '../categories/categories.service.js';
import { applyPriceChange, recordInitialPrice } from '../products/price.js';
import { type ExistingProduct, analyzeImport } from './import.analyzer.js';

type ValidImportRequest = z.output<typeof importRequestSchema>;
type Db = Prisma.TransactionClient | typeof prisma;

/** Una importación grande (miles de filas) puede tardar: se amplía el tiempo de la transacción. */
const IMPORT_TRANSACTION_TIMEOUT_MS = 5 * 60_000;

async function loadCatalog(db: Db): Promise<ExistingProduct[]> {
  const rows = await db.product.findMany({ include: { category: { select: { name: true } } } });
  return rows.map((p) => ({
    id: p.id,
    barcode: p.barcode,
    sku: p.sku,
    name: p.name,
    brand: p.brand,
    presentation: p.presentation,
    category: p.category?.name ?? null,
    priceCents: Number(p.priceCents),
    active: p.active,
  }));
}

function assertHasChanges(summary: ImportSummary): void {
  if (summary.create + summary.update === 0) {
    throw new HttpError(400, 'No hay cambios para aplicar: todas las filas están sin cambios o fueron rechazadas.');
  }
}

/** Analiza el archivo sin modificar nada. */
export async function previewImport(request: ValidImportRequest): Promise<ImportAnalysis> {
  const { rows, summary } = analyzeImport(request.rows, request.mapping, request.options, await loadCatalog(prisma));
  return { rows, summary };
}

/**
 * Aplica la importación. Antes hace una copia de seguridad; después vuelve a analizar el archivo
 * contra el catálogo actual y aplica todo en una única transacción (o se aplica todo o nada).
 * Las filas rechazadas se omiten; no impiden importar el resto.
 */
export async function commitImport(request: ValidImportRequest): Promise<ImportCommitResult> {
  // Chequeo previo para no hacer una copia de seguridad inútil si no hay nada que aplicar.
  assertHasChanges((await previewImport(request)).summary);

  let backupFile: string;
  try {
    backupFile = await createBackup(prisma, config.backupDir, config.backupKeep);
  } catch (error) {
    console.error(error);
    throw new HttpError(500, 'No se pudo crear la copia de seguridad previa, así que la importación no se realizó.');
  }

  return prisma.$transaction(
    async (tx) => {
      const analysis = analyzeImport(request.rows, request.mapping, request.options, await loadCatalog(tx));
      const { summary } = analysis;
      assertHasChanges(summary);

      const batch = await tx.importBatch.create({
        data: {
          fileName: request.fileName,
          createdCount: summary.create,
          updatedCount: summary.update,
          unchangedCount: summary.unchanged,
          rejectedCount: summary.reject,
          priceChangeCount: summary.priceChanged,
        },
      });
      const resolveCategory = await createCategoryResolver(tx);

      for (const { values } of analysis.creates) {
        const priceCents = BigInt(values.priceCents);
        const product = await tx.product.create({
          data: {
            barcode: values.barcode,
            sku: values.sku,
            name: values.name,
            brand: values.brand,
            presentation: values.presentation,
            categoryId: await resolveCategory(values.category),
            priceCents,
            searchText: buildProductSearchText(values),
          },
        });
        await recordInitialPrice(tx, product.id, priceCents, batch.id);
      }

      for (const { product, details, newPriceCents } of analysis.updates) {
        if (Object.keys(details).length > 0) {
          const { category, ...rest } = details;
          const merged = { ...product, ...rest };
          await tx.product.update({
            where: { id: product.id },
            data: {
              ...rest,
              ...(category !== undefined && { categoryId: await resolveCategory(category) }),
              searchText: buildProductSearchText(merged),
            },
          });
        }
        if (newPriceCents !== null) {
          await applyPriceChange(tx, { id: product.id, priceCents: BigInt(product.priceCents) }, BigInt(newPriceCents), 'IMPORT', batch.id);
        }
      }

      return { batchId: batch.id, summary, backupFile };
    },
    { timeout: IMPORT_TRANSACTION_TIMEOUT_MS, maxWait: 10_000 },
  );
}

export async function listImportBatches(limit = 20): Promise<ImportBatchSummary[]> {
  const batches = await prisma.importBatch.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
  return batches.map((b) => ({
    id: b.id,
    fileName: b.fileName,
    createdAt: b.createdAt.toISOString(),
    createdCount: b.createdCount,
    updatedCount: b.updatedCount,
    unchangedCount: b.unchangedCount,
    rejectedCount: b.rejectedCount,
    priceChangeCount: b.priceChangeCount,
  }));
}
