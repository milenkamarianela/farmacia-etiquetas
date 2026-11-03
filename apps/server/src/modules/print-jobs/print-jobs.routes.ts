import { Router } from 'express';
import { paginationQuerySchema, printJobInputSchema } from '@etiquetas/shared';
import { parseId } from '../../lib/params.js';
import { createPrintJob, getPrintJobDetail, getPrintJobPdf, listPrintJobsPage } from './print-jobs.service.js';

export const printJobsRouter = Router();

printJobsRouter.get('/', async (req, res) => {
  res.json(await listPrintJobsPage(paginationQuerySchema.parse(req.query)));
});

printJobsRouter.post('/', async (req, res) => {
  res.status(201).json(await createPrintJob(printJobInputSchema.parse(req.body)));
});

printJobsRouter.get('/:id', async (req, res) => {
  res.json(await getPrintJobDetail(parseId(req.params.id, 'La impresión')));
});

printJobsRouter.get('/:id/pdf', async (req, res) => {
  const { pdf, fileName } = await getPrintJobPdf(parseId(req.params.id, 'La impresión'));
  res
    .type('application/pdf')
    // "inline": se abre en el visor del navegador, listo para imprimir.
    .setHeader('Content-Disposition', `inline; filename="${fileName}"`)
    .send(pdf);
});
