import { Router } from 'express';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { createBackup, getBackupStatus } from './backup.service.js';

export const backupRouter = Router();

backupRouter.get('/', async (_req, res) => {
  res.json(await getBackupStatus(config.backupDir));
});

/** Copia manual ("Hacer copia ahora"). */
backupRouter.post('/', async (_req, res) => {
  await createBackup(prisma, config.backupDir, config.backupKeep);
  res.status(201).json(await getBackupStatus(config.backupDir));
});
