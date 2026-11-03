import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { backupIfStale, createBackup, listBackups } from '../src/modules/backup/backup.service.js';
import { resetDatabase } from './helpers.js';

let dir: string;

beforeEach(async () => {
  await resetDatabase();
  dir = await mkdtemp(path.join(os.tmpdir(), 'backup-test-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('copias de seguridad', () => {
  it('crea una copia completa y legible de la base', async () => {
    await prisma.product.create({ data: { sku: 'X1', name: 'Producto copia', priceCents: 1234n } });
    const file = await createBackup(prisma, dir, 5);
    expect(existsSync(file)).toBe(true);
    expect(path.basename(file)).toMatch(/^farmacia-\d{8}-\d{9}\.db$/);
  });

  it('conserva solo las copias más recientes', async () => {
    for (let day = 1; day <= 4; day++) {
      await createBackup(prisma, dir, 2, new Date(2026, 0, day, 12, 0, 0));
    }
    expect(await listBackups(dir)).toEqual(['farmacia-20260104-120000000.db', 'farmacia-20260103-120000000.db']);
  });

  it('dos copias en el mismo instante no se pisan', async () => {
    const instant = new Date(2026, 0, 1, 12, 0, 0);
    const first = await createBackup(prisma, dir, 5, instant);
    const second = await createBackup(prisma, dir, 5, instant);
    expect(first).not.toBe(second);
    expect(await listBackups(dir)).toEqual(['farmacia-20260101-120000001.db', 'farmacia-20260101-120000000.db']);
  });

  it('reconoce las copias con el formato anterior (sin milisegundos)', async () => {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(path.join(dir, 'farmacia-20251231-235959.db'), '');
    await createBackup(prisma, dir, 5, new Date(2026, 0, 1, 0, 0, 0));
    expect(await listBackups(dir)).toEqual(['farmacia-20260101-000000000.db', 'farmacia-20251231-235959.db']);
  });

  it('no repite la copia diaria si ya hay una reciente', async () => {
    expect(await backupIfStale(prisma, dir, 5)).not.toBeNull();
    expect(await backupIfStale(prisma, dir, 5)).toBeNull();
    expect(await listBackups(dir)).toHaveLength(1);
  });
});
