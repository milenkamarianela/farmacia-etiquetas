import { basename } from 'node:path';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ImportRequest, ParsedImportFile } from '@etiquetas/shared';
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';
import { prisma } from '../src/db.js';
import { listBackups } from '../src/modules/backup/backup.service.js';
import { resetDatabase } from './helpers.js';

const app = createApp();

beforeEach(async () => {
  await resetDatabase();
  await prisma.product.create({
    data: { barcode: '7791234567898', sku: 'IBU-400', name: 'Ibuprofeno 400 mg', priceCents: 1_000_00n, searchText: 'ibuprofeno' },
  });
});

const CSV = [
  'EAN;Código;Descripción;Laboratorio;Rubro;PVP',
  '7791234567898;IBU-400;Ibuprofeno 400 mg;Genérico;Analgésicos;1.250,00', // cambia precio, completa marca y rubro
  '4006381333931;SOL-50;Protector solar FPS 50;Sunny;Dermocosmética;28.990,00', // nuevo
  ';PARA-500;Paracetamol 500 mg;;Analgésicos;999', // nuevo, sin código de barras
  '7791234567890;MAL-1;Código inválido;;;100', // rechazado
].join('\r\n');

async function parse(csv = CSV): Promise<ParsedImportFile> {
  const res = await request(app).post('/api/imports/parse').attach('file', Buffer.from(csv, 'latin1'), 'Lista Óptica.csv');
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body as ParsedImportFile;
}

const toRequest = (file: ParsedImportFile, options = {}): ImportRequest => ({
  fileName: file.fileName,
  rows: file.rows,
  mapping: file.suggestedMapping,
  options: { createNew: true, updateDetails: false, ...options },
});

describe('flujo de importación', () => {
  it('lee el archivo y sugiere las columnas', async () => {
    const file = await parse();
    expect(file.fileName).toBe('Lista Óptica.csv');
    expect(file.rows).toHaveLength(4);
    expect(file.suggestedMapping).toEqual({ barcode: 0, sku: 1, name: 2, brand: 3, presentation: null, category: 4, price: 5 });
  });

  it('la vista previa muestra el resultado sin modificar nada', async () => {
    const res = await request(app).post('/api/imports/preview').send(toRequest(await parse()));
    expect(res.status).toBe(200);
    expect(res.body.summary).toMatchObject({ totalRows: 4, create: 2, update: 1, priceChanged: 1, unchanged: 0, reject: 1 });
    expect(res.body.rows[3].errors[0]).toContain('dígito verificador');
    expect(await prisma.product.count()).toBe(1);
    expect(await prisma.importBatch.count()).toBe(0);
  });

  it('al confirmar aplica cambios, registra el historial y hace una copia previa', async () => {
    const backupsBefore = await listBackups(config.backupDir);
    const res = await request(app).post('/api/imports/commit').send(toRequest(await parse()));
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.summary).toMatchObject({ create: 2, update: 1, reject: 1 });
    expect(await listBackups(config.backupDir)).toContain(basename(res.body.backupFile));
    expect(backupsBefore).not.toContain(basename(res.body.backupFile));

    const ibu = await prisma.product.findUniqueOrThrow({ where: { sku: 'IBU-400' }, include: { category: true } });
    expect(ibu).toMatchObject({ priceCents: 1_250_00n, brand: 'Genérico', name: 'Ibuprofeno 400 mg' });
    expect(ibu.category?.name).toBe('Analgésicos');
    expect(ibu.searchText).toContain('generico');

    const changes = await prisma.priceChange.findMany({ where: { importBatchId: res.body.batchId }, orderBy: { id: 'asc' } });
    expect(changes).toHaveLength(3); // 1 cambio + 2 altas
    expect(changes.find((c) => c.productId === ibu.id)).toMatchObject({
      oldPriceCents: 1_000_00n,
      newPriceCents: 1_250_00n,
      source: 'IMPORT',
    });
    expect(await prisma.category.count()).toBe(2);

    const batch = await prisma.importBatch.findUniqueOrThrow({ where: { id: res.body.batchId } });
    expect(batch).toMatchObject({ fileName: 'Lista Óptica.csv', createdCount: 2, updatedCount: 1, rejectedCount: 1, priceChangeCount: 1 });
    expect((await request(app).get('/api/imports')).body[0].id).toBe(batch.id);
  });

  it('importar dos veces el mismo archivo no duplica productos ni cambios de precio', async () => {
    const file = await parse();
    await request(app).post('/api/imports/commit').send(toRequest(file));
    const products = await prisma.product.count();
    const changes = await prisma.priceChange.count();

    const preview = await request(app).post('/api/imports/preview').send(toRequest(file));
    expect(preview.body.summary).toMatchObject({ create: 0, update: 0, unchanged: 3, reject: 1 });

    const again = await request(app).post('/api/imports/commit').send(toRequest(file));
    expect(again.status).toBe(400);
    expect(again.body.error).toContain('No hay cambios');
    expect(await prisma.product.count()).toBe(products);
    expect(await prisma.priceChange.count()).toBe(changes);
  });

  it('valida la asociación de columnas en el servidor', async () => {
    const file = await parse();
    const res = await request(app)
      .post('/api/imports/preview')
      .send({ ...toRequest(file), mapping: { ...file.suggestedMapping, price: null } });
    expect(res.status).toBe(400);
    expect(res.body.fields.mapping[0]).toContain('precio');
  });

  it('informa archivos no compatibles o ausentes', async () => {
    const xls = await request(app).post('/api/imports/parse').attach('file', Buffer.from('x'), 'viejo.xls');
    expect(xls.status).toBe(400);
    expect(xls.body.error).toContain('.xlsx');
    expect((await request(app).post('/api/imports/parse')).status).toBe(400);
  });
});
