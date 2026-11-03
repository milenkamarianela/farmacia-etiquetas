import { type DashboardSummary, priceChangeQuerySchema } from '@etiquetas/shared';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { getBackupStatus } from '../backup/backup.service.js';
import { listImportBatches } from '../import/import.service.js';
import { listPriceChanges } from '../price-changes/price-changes.service.js';
import { listPrintJobs } from '../print-jobs/print-jobs.service.js';
import { outdatedLabelWhere } from '../products/products.service.js';

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const [activeProducts, inactiveProducts, neverPrinted, priceChangedSinceLastPrint, recentImports, recentPrintJobs, priceChanges, backup] =
    await Promise.all([
      prisma.product.count({ where: { active: true } }),
      prisma.product.count({ where: { active: false } }),
      prisma.product.count({ where: { active: true, lastPrintedPriceCents: null } }),
      prisma.product.count({ where: { active: true, ...outdatedLabelWhere() } }),
      listImportBatches(5),
      listPrintJobs(5),
      listPriceChanges(priceChangeQuerySchema.parse({ pageSize: 8 })),
      getBackupStatus(config.backupDir),
    ]);

  return {
    activeProducts,
    inactiveProducts,
    neverPrinted,
    priceChangedSinceLastPrint,
    recentImports,
    recentPrintJobs,
    recentPriceChanges: priceChanges.items,
    backup,
  };
}
