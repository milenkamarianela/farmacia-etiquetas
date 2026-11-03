import { existsSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import { config } from './config.js';
import { HttpError, errorHandler } from './lib/errors.js';
import { backupRouter } from './modules/backup/backup.routes.js';
import { categoriesRouter } from './modules/categories/categories.routes.js';
import { priceChangesRouter } from './modules/price-changes/price-changes.service.js';
import { dashboardRouter } from './modules/dashboard/dashboard.routes.js';
import { importRouter } from './modules/import/import.routes.js';
import { templatesRouter } from './modules/labels/templates.routes.js';
import { printJobsRouter } from './modules/print-jobs/print-jobs.routes.js';
import { settingsRouter } from './modules/settings/settings.service.js';
import { productsRouter } from './modules/products/products.routes.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  // Límite amplio: la vista previa de una importación envía todas las filas del archivo (hasta 20.000).
  app.use(express.json({ limit: '30mb' }));

  const api = express.Router();
  api.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  api.use('/dashboard', dashboardRouter);
  api.use('/products', productsRouter);
  api.use('/categories', categoriesRouter);
  api.use('/imports', importRouter);
  api.use('/label-templates', templatesRouter);
  api.use('/print-jobs', printJobsRouter);
  api.use('/settings', settingsRouter);
  api.use('/price-changes', priceChangesRouter);
  api.use('/backups', backupRouter);
  api.use((_req, _res, next) => next(new HttpError(404, 'Ruta de API inexistente')));
  app.use('/api', api);

  // En producción el mismo servidor entrega el frontend compilado (una sola dirección para todo).
  if (existsSync(config.webDistDir)) {
    app.use(express.static(config.webDistDir));
    app.use((req, res, next) => {
      if (req.method !== 'GET') return next();
      res.sendFile(path.join(config.webDistDir, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
