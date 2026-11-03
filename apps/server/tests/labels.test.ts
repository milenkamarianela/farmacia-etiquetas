import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_LABEL_TEMPLATE, type LabelTemplateDto } from '@etiquetas/shared';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { ensureDefaultTemplate } from '../src/modules/labels/templates.service.js';
import { resetDatabase } from './helpers.js';

const app = createApp();

let templateId: number;
let ibuId: number;
let paraId: number;

beforeEach(async () => {
  await resetDatabase();
  const template = await request(app).post('/api/label-templates').send(DEFAULT_LABEL_TEMPLATE);
  templateId = template.body.id;
  ibuId = (
    await prisma.product.create({
      data: { barcode: '7791234567898', sku: 'IBU-400', name: 'Ibuprofeno 400 mg', priceCents: 1_245_000n },
    })
  ).id;
  paraId = (
    await prisma.product.create({
      data: { sku: 'PARA-500', name: 'Paracetamol 500 mg', priceCents: 99_900n, lastPrintedPriceCents: 90_000n },
    })
  ).id;
});

/** Supertest no acumula respuestas binarias por defecto: se juntan a mano. */
function getBinary(path: string) {
  return request(app)
    .get(path)
    .buffer(true)
    .parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => callback(null, Buffer.concat(chunks)));
    });
}

const pageCount = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;

describe('plantillas', () => {
  it('la primera plantilla queda como predeterminada e informa cuántas entran por hoja', async () => {
    const [template] = (await request(app).get('/api/label-templates')).body as LabelTemplateDto[];
    expect(template).toMatchObject({ isDefault: true, perPage: 21, usedInPrintJobs: false, widthMm: 60 });
  });

  it('rechaza plantillas que no entran en la hoja', async () => {
    const res = await request(app)
      .post('/api/label-templates')
      .send({ ...DEFAULT_LABEL_TEMPLATE, name: 'Gigante', widthMm: 250 });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('no entra');
  });

  it('valida medidas y nombre', async () => {
    const res = await request(app).post('/api/label-templates').send({ ...DEFAULT_LABEL_TEMPLATE, name: '', widthMm: 5 });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.fields)).toEqual(expect.arrayContaining(['name', 'widthMm']));
  });

  it('cambia la predeterminada', async () => {
    const other = await request(app).post('/api/label-templates').send({ ...DEFAULT_LABEL_TEMPLATE, name: 'Chica', widthMm: 38, heightMm: 21 });
    expect(other.body.isDefault).toBe(false);
    await request(app).post(`/api/label-templates/${other.body.id}/default`);
    const list = (await request(app).get('/api/label-templates')).body as LabelTemplateDto[];
    expect(list.filter((t) => t.isDefault).map((t) => t.name)).toEqual(['Chica']);
  });

  it('al iniciar crea la plantilla predeterminada si no hay ninguna, sin tocar las existentes', async () => {
    await ensureDefaultTemplate();
    expect(await prisma.labelTemplate.count()).toBe(1);
    await resetDatabase();
    await ensureDefaultTemplate();
    expect(await prisma.labelTemplate.findMany()).toMatchObject([{ name: DEFAULT_LABEL_TEMPLATE.name, isDefault: true }]);
  });

  it('no deja borrar la única plantilla ni una usada en impresiones', async () => {
    expect((await request(app).delete(`/api/label-templates/${templateId}`)).status).toBe(409);
    const other = await request(app).post('/api/label-templates').send({ ...DEFAULT_LABEL_TEMPLATE, name: 'Otra' });
    await request(app).post('/api/print-jobs').send({ templateId, items: [{ productId: ibuId, quantity: 1 }] });
    const res = await request(app).delete(`/api/label-templates/${templateId}`);
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('historial');
    // La que no se usó sí se puede borrar.
    expect((await request(app).delete(`/api/label-templates/${other.body.id}`)).status).toBe(204);
  });
});

describe('impresión de etiquetas', () => {
  it('registra la impresión y marca los productos como impresos con el precio actual', async () => {
    const res = await request(app)
      .post('/api/print-jobs')
      .send({ templateId, items: [{ productId: ibuId, quantity: 3 }, { productId: paraId, quantity: 2 }] });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body).toMatchObject({ labelCount: 5, pageCount: 1, warnings: [] });

    const items = await prisma.printJobItem.findMany({ orderBy: { id: 'asc' } });
    expect(items.map((i) => [i.productId, i.quantity, i.priceCents])).toEqual([
      [ibuId, 3, 1_245_000n],
      [paraId, 2, 99_900n],
    ]);
    const statuses = (await request(app).get('/api/products')).body.items.map((p: { labelStatus: string }) => p.labelStatus);
    expect(statuses).toEqual(['current', 'current']);

    const summary = (await request(app).get('/api/dashboard/summary')).body;
    expect(summary).toMatchObject({ neverPrinted: 0, priceChangedSinceLastPrint: 0 });
    expect(summary.recentPrintJobs[0]).toMatchObject({ labelCount: 5, productCount: 2, templateName: DEFAULT_LABEL_TEMPLATE.name });
  });

  it('una impresión de prueba no marca los productos', async () => {
    await request(app)
      .post('/api/print-jobs')
      .send({ templateId, items: [{ productId: paraId, quantity: 1 }], markAsPrinted: false });
    const para = await prisma.product.findUniqueOrThrow({ where: { id: paraId } });
    expect(para.lastPrintedPriceCents).toBe(90_000n);
  });

  it('respeta el orden de la lista y suma productos repetidos', async () => {
    await request(app)
      .post('/api/print-jobs')
      .send({ templateId, items: [{ productId: paraId, quantity: 1 }, { productId: ibuId, quantity: 1 }, { productId: paraId, quantity: 2 }] });
    const items = await prisma.printJobItem.findMany({ orderBy: { id: 'asc' } });
    expect(items.map((i) => [i.productId, i.quantity])).toEqual([
      [paraId, 3],
      [ibuId, 1],
    ]);
  });

  it('no imprime productos inactivos ni inexistentes', async () => {
    await prisma.product.update({ where: { id: paraId }, data: { active: false } });
    const inactive = await request(app).post('/api/print-jobs').send({ templateId, items: [{ productId: paraId, quantity: 1 }] });
    expect(inactive.status).toBe(400);
    expect(inactive.body.error).toContain('inactivos');
    const missing = await request(app).post('/api/print-jobs').send({ templateId, items: [{ productId: 9999, quantity: 1 }] });
    expect(missing.status).toBe(400);
    expect(await prisma.printJob.count()).toBe(0);
  });

  it('valida cantidades', async () => {
    const res = await request(app).post('/api/print-jobs').send({ templateId, items: [{ productId: ibuId, quantity: 0 }] });
    expect(res.status).toBe(400);
  });
});

describe('PDF', () => {
  it('tiene páginas A4 exactas (595,28 × 841,89 pt) y las hojas necesarias', async () => {
    const job = await request(app)
      .post('/api/print-jobs')
      .send({ templateId, items: [{ productId: ibuId, quantity: 30 }], startPosition: 5 });
    // 30 etiquetas empezando en la posición 5 de 21 → 34 lugares → 2 hojas.
    expect(job.body.pageCount).toBe(2);

    const res = await getBinary(`/api/print-jobs/${job.body.id}/pdf`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toMatch(/^inline; filename="etiquetas-\d{4}-\d{2}-\d{2}-\d+\.pdf"$/);
    const pdf = res.body as Buffer;
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pageCount(pdf)).toBe(2);
    const boxes = [...pdf.toString('latin1').matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)];
    expect(boxes).toHaveLength(2);
    for (const [, width, height] of boxes) {
      // A4 = 210 × 297 mm = 595,2756 × 841,8898 pt
      expect(Number(width)).toBeCloseTo((210 * 72) / 25.4, 2);
      expect(Number(height)).toBeCloseTo((297 * 72) / 25.4, 2);
    }
  });

  it('se reimprime con el precio de ese momento aunque después cambie', async () => {
    const job = await request(app).post('/api/print-jobs').send({ templateId, items: [{ productId: ibuId, quantity: 1 }] });
    await prisma.product.update({ where: { id: ibuId }, data: { priceCents: 2_000_000n } });
    const items = await prisma.printJobItem.findMany({ where: { printJobId: job.body.id } });
    expect(items[0]!.priceCents).toBe(1_245_000n);
    expect((await getBinary(`/api/print-jobs/${job.body.id}/pdf`)).status).toBe(200);
  });

  it('responde 404 para impresiones inexistentes', async () => {
    expect((await request(app).get('/api/print-jobs/999/pdf')).status).toBe(404);
  });
});

describe('configuración', () => {
  it('guarda y valida el nombre de la farmacia', async () => {
    expect((await request(app).put('/api/settings').send({ pharmacyName: '  Farmacia Central ' })).body).toEqual({
      pharmacyName: 'Farmacia Central',
    });
    expect((await request(app).get('/api/settings')).body.pharmacyName).toBe('Farmacia Central');
    expect((await request(app).put('/api/settings').send({ pharmacyName: 'x'.repeat(81) })).status).toBe(400);
  });
});
