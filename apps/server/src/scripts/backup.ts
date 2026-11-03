import { config } from '../config.js';
import { prisma } from '../db.js';
import { createBackup } from '../modules/backup/backup.service.js';

try {
  const file = await createBackup(prisma, config.backupDir, config.backupKeep);
  console.log(`Copia de seguridad creada: ${file}`);
} catch (error) {
  console.error('No se pudo crear la copia de seguridad:', error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
