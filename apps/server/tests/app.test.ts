import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { resetDatabase } from './helpers.js';

const app = createApp();

beforeEach(resetDatabase);

describe('API base', () => {
  it('usa la base de pruebas y no la real', () => {
    expect(process.env.DATABASE_URL).toBe('file:./test.db');
  });

  it('GET /api/health responde ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('rutas de API inexistentes devuelven 404 en JSON', async () => {
    const res = await request(app).get('/api/no-existe');
    expect(res.status).toBe(404);
    expect(res.body.error).toBeTypeOf('string');
  });

  it('JSON mal formado devuelve 400 con mensaje claro', async () => {
    const res = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{malo');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('JSON');
  });
});

describe('GET /api/dashboard/summary', () => {
  it('distingue productos sin etiqueta de productos con etiqueta desactualizada', async () => {
    await prisma.product.createMany({
      data: [
        // Nunca impreso
        { barcode: '7791234567898', name: 'A', priceCents: 1000n },
        // Impreso con el precio actual: al día
        { sku: 'B', name: 'B', priceCents: 2000n, lastPrintedPriceCents: 2000n },
        // Impreso con precio viejo: hay que reimprimir
        { sku: 'C', name: 'C', priceCents: 3500n, lastPrintedPriceCents: 3000n },
        // Inactivo: no cuenta como pendiente
        { sku: 'D', name: 'D', priceCents: 100n, active: false },
      ],
    });

    const res = await request(app).get('/api/dashboard/summary');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      activeProducts: 3,
      inactiveProducts: 1,
      neverPrinted: 1,
      priceChangedSinceLastPrint: 1,
      recentImports: [],
      recentPrintJobs: [],
    });
  });
});
