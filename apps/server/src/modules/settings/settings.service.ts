import { type Settings, settingsSchema } from '@etiquetas/shared';
import { Router } from 'express';
import { prisma } from '../../db.js';

const DEFAULTS: Settings = { pharmacyName: '' };

export async function getSettings(): Promise<Settings> {
  const rows = await prisma.setting.findMany();
  const values = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return { ...DEFAULTS, ...settingsSchema.partial().parse(values) };
}

export async function saveSettings(settings: Settings): Promise<Settings> {
  await prisma.$transaction(
    Object.entries(settings).map(([key, value]) =>
      prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } }),
    ),
  );
  return getSettings();
}

export const settingsRouter = Router();

settingsRouter.get('/', async (_req, res) => {
  res.json(await getSettings());
});

settingsRouter.put('/', async (req, res) => {
  res.json(await saveSettings(settingsSchema.parse(req.body)));
});
