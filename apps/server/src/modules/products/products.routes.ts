import { Router } from 'express';
import { MAX_BULK_SELECTION, bulkStatusSchema, productInputSchema, productListQuerySchema } from '@etiquetas/shared';
import { z } from 'zod';
import { parseId } from '../../lib/params.js';
import {
  createProduct,
  getProduct,
  getProductsByIds,
  listPriceChanges,
  listProductIds,
  listProducts,
  setProductsActive,
  updateProduct,
} from './products.service.js';

export const productsRouter = Router();

const productIdsSchema = z.object({ ids: z.array(z.number().int().positive()).max(MAX_BULK_SELECTION) });

productsRouter.get('/', async (req, res) => {
  res.json(await listProducts(productListQuerySchema.parse(req.query)));
});

productsRouter.get('/ids', async (req, res) => {
  res.json({ ids: await listProductIds(productListQuerySchema.parse(req.query)) });
});

productsRouter.post('/', async (req, res) => {
  res.status(201).json(await createProduct(productInputSchema.parse(req.body)));
});

productsRouter.post('/by-ids', async (req, res) => {
  const { ids } = productIdsSchema.parse(req.body);
  res.json(await getProductsByIds(ids));
});

productsRouter.post('/bulk-status', async (req, res) => {
  const { ids, active } = bulkStatusSchema.parse(req.body);
  res.json({ updated: await setProductsActive(ids, active) });
});

productsRouter.get('/:id', async (req, res) => {
  res.json(await getProduct(parseId(req.params.id, 'El producto')));
});

productsRouter.put('/:id', async (req, res) => {
  const id = parseId(req.params.id, 'El producto');
  res.json(await updateProduct(id, productInputSchema.parse(req.body)));
});

productsRouter.get('/:id/price-changes', async (req, res) => {
  res.json(await listPriceChanges(parseId(req.params.id, 'El producto')));
});
