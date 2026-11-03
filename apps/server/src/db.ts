import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

/**
 * Modo WAL: lecturas y escrituras concurrentes sin bloquearse y más resistencia a cortes de luz.
 * Queda guardado en el archivo de la base, así que alcanza con activarlo al arrancar.
 * (Prisma ya activa las claves foráneas y un tiempo de espera ante bloqueos en cada conexión).
 */
export async function configureDatabase(): Promise<void> {
  await prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL;');
}
