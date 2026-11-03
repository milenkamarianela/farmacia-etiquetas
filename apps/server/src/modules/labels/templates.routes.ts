import { Router } from 'express';
import { labelTemplateInputSchema } from '@etiquetas/shared';
import { parseId } from '../../lib/params.js';
import {
  createTemplate,
  deleteTemplate,
  getTemplate,
  listTemplates,
  setDefaultTemplate,
  updateTemplate,
} from './templates.service.js';

export const templatesRouter = Router();

templatesRouter.get('/', async (_req, res) => {
  res.json(await listTemplates());
});

templatesRouter.post('/', async (req, res) => {
  res.status(201).json(await createTemplate(labelTemplateInputSchema.parse(req.body)));
});

templatesRouter.get('/:id', async (req, res) => {
  res.json(await getTemplate(parseId(req.params.id, 'La plantilla')));
});

templatesRouter.put('/:id', async (req, res) => {
  res.json(await updateTemplate(parseId(req.params.id, 'La plantilla'), labelTemplateInputSchema.parse(req.body)));
});

templatesRouter.post('/:id/default', async (req, res) => {
  res.json(await setDefaultTemplate(parseId(req.params.id, 'La plantilla')));
});

templatesRouter.delete('/:id', async (req, res) => {
  await deleteTemplate(parseId(req.params.id, 'La plantilla'));
  res.status(204).end();
});
