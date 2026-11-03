import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_LABEL_TEMPLATE, type PriceChangeListItem } from '@etiquetas/shared';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { resetDatabase } from './helpers.js';

const app = createApp();

let ibuId: number;
let algId: number;

beforeEach(async () => {
  await resetDatabase();
  const create = async (body: object) => (await request(app).post('/api/products').send(body)).body.id as number;
  ibuId = await create({ barcode: '7791234567898', name: 'Ibuprofeno 400 mg', priceCents: 100_000 });
  algId = await create({ sku: 'ALG-1', name: 'Algodón hidrófilo', priceCents: 50_000 });
  await request(app).put(`/api/products/${ibuId}`).send({ barcode: '7791234567898', name: 'Ibuprofeno 400 mg', priceCents: 120_000 });
  await request(app).put(`/api/products/${algId}`).send({ sku: 'ALG-1', name: 'Algodón hidrófilo', priceCents: 55_000 });
});

const items = (res: request.Response) => res.body.items as PriceChangeListItem[];

describe('historial de precios', () => {
  it('por defecto muestra solo cambios (sin las altas), del más reciente al más viejo', async () => {
    const res = await request(app).get('/api/price-changes');
    expect(res.body.total).toBe(2);
    expect(items(res).map((c) => [c.productName, c.oldPriceCents, c.newPriceCents, c.source])).toEqual([
      ['Algodón hidrófilo', 50_000, 55_000, 'MANUAL'],
      ['Ibuprofeno 400 mg', 100_000, 120_000, 'MANUAL'],
    ]);
  });

  it('los productos creados por una importación no cuentan como "cambios"', async () => {
    await prisma.priceChange.create({
      data: { productId: algId, oldPriceCents: null, newPriceCents: 1n, source: 'IMPORT' },
    });
    expect((await request(app).get('/api/price-changes')).body.total).toBe(2);
    expect((await request(app).get('/api/price-changes').query({ source: 'IMPORT' })).body.total).toBe(1);
  });

  it('filtra por origen, producto (sin acentos) e importación', async () => {
    expect((await request(app).get('/api/price-changes').query({ source: 'all' })).body.total).toBe(4);
    expect((await request(app).get('/api/price-changes').query({ source: 'CREATE' })).body.total).toBe(2);
    const search = await request(app).get('/api/price-changes').query({ search: 'algodon' });
    expect(items(search).map((c) => c.productName)).toEqual(['Algodón hidrófilo']);
    expect((await request(app).get('/api/price-changes').query({ importBatchId: 999 })).body.total).toBe(0);
  });

  it('filtra por fechas (día completo, hora local)', async () => {
    const today = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const day = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    expect((await request(app).get('/api/price-changes').query({ from: day, to: day })).body.total).toBe(2);
    expect((await request(app).get('/api/price-changes').query({ to: '2020-01-01' })).body.total).toBe(0);
    expect((await request(app).get('/api/price-changes').query({ from: '2030-01-02', to: '2030-01-01' })).status).toBe(400);
    expect((await request(app).get('/api/price-changes').query({ from: '03/11/2026' })).status).toBe(400);
  });

  it('pagina los resultados', async () => {
    const res = await request(app).get('/api/price-changes').query({ source: 'all', pageSize: 3, page: 2 });
    expect(res.body).toMatchObject({ total: 4, page: 2, pageSize: 3 });
    expect(items(res)).toHaveLength(1);
  });
});

describe('historial de impresiones', () => {
  it('lista paginada y detalle con el precio impreso y el actual', async () => {
    const template = (await request(app).post('/api/label-templates').send(DEFAULT_LABEL_TEMPLATE)).body;
    const job = (
      await request(app)
        .post('/api/print-jobs')
        .send({ templateId: template.id, items: [{ productId: ibuId, quantity: 2 }, { productId: algId, quantity: 1 }], startPosition: 4 })
    ).body;
    await request(app).put(`/api/products/${ibuId}`).send({ barcode: '7791234567898', name: 'Ibuprofeno 400 mg', priceCents: 130_000 });

    const list = await request(app).get('/api/print-jobs');
    expect(list.body).toMatchObject({ total: 1, items: [{ id: job.id, labelCount: 3, productCount: 2 }] });

    const detail = await request(app).get(`/api/print-jobs/${job.id}`);
    expect(detail.body).toMatchObject({ templateName: DEFAULT_LABEL_TEMPLATE.name, startPosition: 4, widthMm: 60 });
    expect(detail.body.items).toEqual([
      { productId: ibuId, name: 'Ibuprofeno 400 mg', quantity: 2, priceCents: 120_000, currentPriceCents: 130_000 },
      { productId: algId, name: 'Algodón hidrófilo', quantity: 1, priceCents: 55_000, currentPriceCents: 55_000 },
    ]);
    expect((await request(app).get('/api/print-jobs/999')).status).toBe(404);
  });
});

describe('copias de seguridad y panel', () => {
  it('informa el estado y permite hacer una copia manual', async () => {
    const before = (await request(app).get('/api/backups')).body;
    const created = await request(app).post('/api/backups');
    expect(created.status).toBe(201);
    expect(created.body.count).toBe(Math.min(before.count + 1, 30));
    expect(new Date(created.body.lastBackupAt).getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  it('el panel incluye los últimos cambios de precio y el estado de las copias', async () => {
    const summary = (await request(app).get('/api/dashboard/summary')).body;
    expect(summary.recentPriceChanges.map((c: PriceChangeListItem) => c.productName)).toEqual([
      'Algodón hidrófilo',
      'Ibuprofeno 400 mg',
    ]);
    expect(summary.backup).toHaveProperty('directory');
    expect(await prisma.priceChange.count()).toBe(4);
  });
});
