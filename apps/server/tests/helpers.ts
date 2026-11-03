import { prisma } from '../src/db.js';

/** Vacía todas las tablas respetando el orden de las claves foráneas. */
export async function resetDatabase() {
  await prisma.$transaction([
    prisma.printJobItem.deleteMany(),
    prisma.printJob.deleteMany(),
    prisma.priceChange.deleteMany(),
    prisma.importBatch.deleteMany(),
    prisma.product.deleteMany(),
    prisma.category.deleteMany(),
    prisma.labelTemplate.deleteMany(),
    prisma.setting.deleteMany(),
  ]);
}
