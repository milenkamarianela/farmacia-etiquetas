import { existsSync } from 'node:fs';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import type { BackupStatus } from '@etiquetas/shared';

// farmacia-AAAAMMDD-HHMMSSmmm.db (las copias anteriores no llevaban milisegundos).
const BACKUP_PATTERN = /^farmacia-\d{8}-\d{6}(\d{3})?\.db$/;

function timestamp(date: Date): string {
  const pad = (n: number, size = 2) => String(n).padStart(size, '0');
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}${pad(date.getMilliseconds(), 3)}`
  );
}

/** Nombre libre para la copia: si ya existe uno igual (dos copias en el mismo milisegundo), avanza 1 ms. */
function backupPath(dir: string, date: Date): string {
  let time = date.getTime();
  let file = path.join(dir, `farmacia-${timestamp(new Date(time))}.db`);
  while (existsSync(file)) {
    time += 1;
    file = path.join(dir, `farmacia-${timestamp(new Date(time))}.db`);
  }
  return file;
}

export async function listBackups(dir: string): Promise<string[]> {
  try {
    const files = await readdir(dir);
    // El nombre lleva fecha y hora, así que el orden alfabético es cronológico.
    return files.filter((f) => BACKUP_PATTERN.test(f)).sort().reverse();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

/**
 * Crea una copia consistente de la base con `VACUUM INTO` (segura aunque la app esté en uso)
 * y conserva solo las `keep` copias más recientes.
 */
export async function createBackup(
  prisma: PrismaClient,
  dir: string,
  keep: number,
  now = new Date(),
): Promise<string> {
  await mkdir(dir, { recursive: true });
  const file = backupPath(dir, now);
  await prisma.$executeRawUnsafe(`VACUUM INTO '${file.replaceAll("'", "''")}'`);

  if (keep > 0) {
    const backups = await listBackups(dir);
    for (const old of backups.slice(keep)) {
      await rm(path.join(dir, old));
    }
  }
  return file;
}

export async function getBackupStatus(dir: string): Promise<BackupStatus> {
  const backups = await listBackups(dir);
  const latest = backups[0];
  return {
    lastBackupAt: latest ? (await stat(path.join(dir, latest))).mtime.toISOString() : null,
    count: backups.length,
    directory: dir,
  };
}

/** Hace una copia si la última tiene más de 24 horas (o si no hay ninguna). */
export async function backupIfStale(prisma: PrismaClient, dir: string, keep: number): Promise<string | null> {
  const [latest] = await listBackups(dir);
  if (latest) {
    const info = await stat(path.join(dir, latest));
    if (Date.now() - info.mtimeMs < 24 * 60 * 60 * 1000) return null;
  }
  return createBackup(prisma, dir, keep);
}
