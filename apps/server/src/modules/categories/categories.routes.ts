import { Router } from 'express';
import { listCategories } from './categories.service.js';

export const categoriesRouter = Router();

categoriesRouter.get('/', async (_req, res) => {
  res.json(await listCategories());
});
