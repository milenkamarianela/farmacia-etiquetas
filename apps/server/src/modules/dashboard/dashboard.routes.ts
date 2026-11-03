import { Router } from 'express';
import { getDashboardSummary } from './dashboard.service.js';

export const dashboardRouter = Router();

dashboardRouter.get('/summary', async (_req, res) => {
  res.json(await getDashboardSummary());
});
