import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ProductDto } from '@etiquetas/shared';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { resetDatabase } from './helpers.js';

const app = createApp();

beforeEach(resetDatabase);

const ibuprofeno = {
  barcode: '7791234567898',
  sku: 'IBU-400',
  name: 'Ibuprofeno 400 mg',
  brand: 'Genérico',
  presentation: 'x 10 comprimidos',
  category: 'Analgésicos',
  priceCents: 1_245_000,
};

async function create(body: object = ibuprofeno): Promise<ProductDto> {
  const res = await request(app).post('/api/products').send(body);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as ProductDto;
}

const priceChanges = (productId: number) =>
  prisma.priceChange.findMany({ where: { productId }, orderBy: { id: 'asc' } });

describe('alta de productos', () => {
  it('crea el producto, su categoría y registra el precio inicial', async () => {
    const product = await create();
    expect(product).toMatchObject({
      name: 'Ibuprofeno 400 mg',
      category: 'Analgésicos',
      priceCents: 1_245_000,
      active: true,
      labelStatus: 'never',
    });
    const changes = await priceChanges(product.id);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ oldPriceCents: null, newPriceCents: 1_245_000n, source: 'CREATE' });
  });

  it('valida los datos en el servidor y devuelve errores por campo', async () => {
    const res = await request(app).post('/api/products').send({ name: '', priceCents: -5 });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.fields)).toEqual(expect.arrayContaining(['name', 'priceCents']));
  });

  it('rechaza códigos de barras con dígito verificador incorrecto', async () => {
    const res = await request(app).post('/api/products').send({ ...ibuprofeno, barcode: '7791234567890' });
    expect(res.status).toBe(400);
    expect(res.body.fields.barcode[0]).toContain('verificador');
  });

  it('no permite duplicar código de barras ni código interno', async () => {
    await create();
    const sameBarcode = await request(app).post('/api/products').send({ ...ibuprofeno, sku: 'OTRO' });
    expect(sameBarcode.status).toBe(409);
    expect(sameBarcode.body.error).toContain('código de barras');

    const sameSku = await request(app).post('/api/products').send({ ...ibuprofeno, barcode: null });
    expect(sameSku.status).toBe(409);
    expect(sameSku.body.error).toContain('código interno');
    expect(await prisma.product.count()).toBe(1);
  });

  it('reutiliza la categoría aunque cambien mayúsculas o acentos', async () => {
    await create();
    await create({ sku: 'PARA-500', name: 'Paracetamol 500', category: 'ANALGESICOS', priceCents: 100 });
    expect(await prisma.category.count()).toBe(1);
  });
});

describe('edición de productos y cambios de precio', () => {
  it('si el precio no cambia, no registra un cambio', async () => {
    const product = await create();
    const res = await request(app).put(`/api/products/${product.id}`).send({ ...ibuprofeno, name: 'Ibuprofeno 400' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Ibuprofeno 400');
    expect(res.body.priceUpdatedAt).toBe(product.priceUpdatedAt);
    expect(await priceChanges(product.id)).toHaveLength(1);
  });

  it('si el precio cambia, registra el anterior y el nuevo', async () => {
    const product = await create();
    const res = await request(app).put(`/api/products/${product.id}`).send({ ...ibuprofeno, priceCents: 1_390_000 });
    expect(res.body.priceCents).toBe(1_390_000);
    const changes = await priceChanges(product.id);
    expect(changes).toHaveLength(2);
    expect(changes[1]).toMatchObject({ oldPriceCents: 1_245_000n, newPriceCents: 1_390_000n, source: 'MANUAL' });

    const history = await request(app).get(`/api/products/${product.id}/price-changes`);
    expect(history.body.map((c: { newPriceCents: number }) => c.newPriceCents)).toEqual([1_390_000, 1_245_000]);
  });

  it('marca la etiqueta como desactualizada si cambia un precio ya impreso', async () => {
    const product = await create();
    await prisma.product.update({ where: { id: product.id }, data: { lastPrintedPriceCents: 1_245_000n } });
    expect((await request(app).get(`/api/products/${product.id}`)).body.labelStatus).toBe('current');

    await request(app).put(`/api/products/${product.id}`).send({ ...ibuprofeno, priceCents: 1_300_000 });
    expect((await request(app).get(`/api/products/${product.id}`)).body.labelStatus).toBe('outdated');
  });

  it('si la edición falla, no queda ningún cambio a medias', async () => {
    const product = await create();
    await create({ sku: 'OTRO', name: 'Otro', priceCents: 1 });
    const res = await request(app)
      .put(`/api/products/${product.id}`)
      .send({ ...ibuprofeno, sku: 'OTRO', priceCents: 999 });
    expect(res.status).toBe(409);
    expect((await request(app).get(`/api/products/${product.id}`)).body.priceCents).toBe(1_245_000);
    expect(await priceChanges(product.id)).toHaveLength(1);
  });

  it('devuelve 404 para productos inexistentes', async () => {
    expect((await request(app).get('/api/products/9999')).status).toBe(404);
    expect((await request(app).get('/api/products/abc')).status).toBe(404);
    expect((await request(app).put('/api/products/9999').send(ibuprofeno)).status).toBe(404);
  });
});

describe('listado, búsqueda y filtros', () => {
  beforeEach(async () => {
    await create();
    await create({ sku: 'ALG-1', name: 'ALGODÓN HIDRÓFILO', presentation: '500 g', category: 'Perfumería', priceCents: 350_000 });
    await create({ sku: 'PARA-500', name: 'Paracetamol 500 mg', category: 'Analgésicos', priceCents: 99_900 });
    const inactive = await create({ sku: 'VIEJO', name: 'Producto discontinuado', priceCents: 100 });
    await request(app).post('/api/products/bulk-status').send({ ids: [inactive.id], active: false });
  });

  const names = (res: request.Response) => (res.body.items as ProductDto[]).map((p) => p.name);

  it('por defecto lista solo activos, ordenados por nombre', async () => {
    const res = await request(app).get('/api/products');
    expect(res.body.total).toBe(3);
    expect(names(res)).toEqual(['ALGODÓN HIDRÓFILO', 'Ibuprofeno 400 mg', 'Paracetamol 500 mg']);
  });

  it('busca sin importar acentos, mayúsculas ni orden de palabras', async () => {
    expect(names(await request(app).get('/api/products').query({ search: 'algodon' }))).toEqual(['ALGODÓN HIDRÓFILO']);
    expect(names(await request(app).get('/api/products').query({ search: '400 ibu' }))).toEqual(['Ibuprofeno 400 mg']);
  });

  it('busca por código de barras y por código interno', async () => {
    expect(names(await request(app).get('/api/products').query({ search: '7791234567898' }))).toEqual(['Ibuprofeno 400 mg']);
    expect(names(await request(app).get('/api/products').query({ search: 'para-500' }))).toEqual(['Paracetamol 500 mg']);
  });

  it('filtra por categoría y por estado', async () => {
    const [category] = (await request(app).get('/api/categories')).body;
    expect(category).toMatchObject({ name: 'Analgésicos', productCount: 2 });
    expect((await request(app).get('/api/products').query({ categoryId: category.id })).body.total).toBe(2);
    expect(names(await request(app).get('/api/products').query({ status: 'inactive' }))).toEqual(['Producto discontinuado']);
    expect((await request(app).get('/api/products').query({ status: 'all' })).body.total).toBe(4);
  });

  it('filtra por estado de etiqueta', async () => {
    const algodon = await prisma.product.findFirstOrThrow({ where: { sku: 'ALG-1' } });
    const para = await prisma.product.findFirstOrThrow({ where: { sku: 'PARA-500' } });
    await prisma.product.update({ where: { id: algodon.id }, data: { lastPrintedPriceCents: 300_000n } });
    await prisma.product.update({ where: { id: para.id }, data: { lastPrintedPriceCents: 99_900n } });

    expect(names(await request(app).get('/api/products').query({ labelStatus: 'outdated' }))).toEqual(['ALGODÓN HIDRÓFILO']);
    expect(names(await request(app).get('/api/products').query({ labelStatus: 'current' }))).toEqual(['Paracetamol 500 mg']);
    expect(names(await request(app).get('/api/products').query({ labelStatus: 'never' }))).toEqual(['Ibuprofeno 400 mg']);
  });

  it('pagina y ordena por precio', async () => {
    const res = await request(app).get('/api/products').query({ sort: 'price', order: 'desc', page: 2, pageSize: 2 });
    expect(res.body).toMatchObject({ total: 3, page: 2, pageSize: 2 });
    expect(names(res)).toEqual(['Paracetamol 500 mg']);
  });

  it('devuelve todos los ids que coinciden con los filtros', async () => {
    const res = await request(app).get('/api/products/ids').query({ search: 'mg' });
    expect(res.body.ids).toHaveLength(2);
  });

  it('activa y desactiva en forma masiva sin borrar nada', async () => {
    const ids = (await request(app).get('/api/products/ids')).body.ids;
    const res = await request(app).post('/api/products/bulk-status').send({ ids, active: false });
    expect(res.body.updated).toBe(3);
    expect((await request(app).get('/api/products')).body.total).toBe(0);
    expect(await prisma.product.count()).toBe(4);
  });

  it('rechaza parámetros inválidos', async () => {
    expect((await request(app).get('/api/products').query({ pageSize: 5000 })).status).toBe(400);
    expect((await request(app).post('/api/products/bulk-status').send({ ids: [], active: true })).status).toBe(400);
  });
});
