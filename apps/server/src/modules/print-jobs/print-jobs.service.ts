import {
  type LabelProductData,
  type LabelTemplateShape,
  type Paginated,
  type PrintJobCreated,
  type PrintJobDetail,
  type PrintJobSummary,
  paginationQuerySchema,
  computeSheetLayout,
  labelTemplateConfigSchema,
  layoutLabel,
  printJobInputSchema,
} from '@etiquetas/shared';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { HttpError, notFound } from '../../lib/errors.js';
import { toTemplateShape } from '../labels/templates.service.js';
import { getSettings } from '../settings/settings.service.js';
import { renderLabelsPdf } from './pdf.js';

type PrintJobInput = z.output<typeof printJobInputSchema>;

/** Copia de la plantilla y opciones guardada con cada impresión, para poder reimprimirla igual. */
const snapshotSchema = z.object({
  name: z.string(),
  widthMm: z.number(),
  heightMm: z.number(),
  config: labelTemplateConfigSchema,
  startPosition: z.number().int().min(1),
  pharmacyName: z.string(),
});
type TemplateSnapshot = z.infer<typeof snapshotSchema>;

const MAX_WARNINGS = 20;

function sheetPerPage(shape: LabelTemplateShape): number {
  try {
    return computeSheetLayout(shape.widthMm, shape.heightMm, shape.config.sheet).perPage;
  } catch (error) {
    throw new HttpError(400, (error as Error).message);
  }
}

/**
 * Registra un trabajo de impresión. Guarda el precio impreso de cada producto y, si se pide,
 * marca los productos como impresos (su etiqueta deja de figurar como desactualizada).
 */
export async function createPrintJob(input: PrintJobInput): Promise<PrintJobCreated> {
  const { pharmacyName } = await getSettings();

  return prisma.$transaction(async (tx) => {
    const template = await tx.labelTemplate.findUnique({ where: { id: input.templateId } });
    if (!template) throw notFound('La plantilla');
    const shape = toTemplateShape(template);
    const perPage = sheetPerPage(shape);

    // Un producto repetido en la lista se suma en un solo renglón.
    const quantities = new Map<number, number>();
    for (const item of input.items) {
      quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
    }
    const found = new Map(
      (await tx.product.findMany({ where: { id: { in: [...quantities.keys()] } } })).map((p) => [p.id, p]),
    );
    if (found.size !== quantities.size) throw new HttpError(400, 'Algunos productos de la lista ya no existen.');
    // Se respeta el orden de la lista (por ejemplo, ordenada por góndola).
    const products = [...quantities.keys()].map((id) => found.get(id)!);
    const inactive = products.filter((p) => !p.active);
    if (inactive.length > 0) {
      throw new HttpError(
        400,
        `No se imprimen productos inactivos: ${inactive.slice(0, 5).map((p) => p.name).join(', ')}${inactive.length > 5 ? '…' : ''}`,
      );
    }

    const labelCount = [...quantities.values()].reduce((sum, q) => sum + q, 0);
    const snapshot: TemplateSnapshot = {
      name: template.name,
      widthMm: shape.widthMm,
      heightMm: shape.heightMm,
      config: shape.config,
      startPosition: Math.min(input.startPosition, perPage),
      pharmacyName,
    };

    const job = await tx.printJob.create({
      data: {
        templateId: template.id,
        templateSnapshot: JSON.stringify(snapshot),
        labelCount,
        items: {
          create: products.map((p) => ({ productId: p.id, quantity: quantities.get(p.id)!, priceCents: p.priceCents })),
        },
      },
    });

    if (input.markAsPrinted) {
      const now = new Date();
      for (const product of products) {
        await tx.product.update({
          where: { id: product.id },
          data: { lastPrintedPriceCents: product.priceCents, lastPrintedAt: now },
        });
      }
    }

    // Avisos de diseño (precio chico, código omitido…) para que el usuario los vea antes de imprimir.
    const warnings: string[] = [];
    for (const product of products) {
      const layout = layoutLabel({ ...product, priceCents: Number(product.priceCents) }, shape, { pharmacyName });
      for (const warning of layout.warnings) {
        if (warnings.length < MAX_WARNINGS) warnings.push(`${product.name}: ${warning}`);
      }
    }

    return {
      id: job.id,
      labelCount,
      pageCount: Math.ceil((labelCount + snapshot.startPosition - 1) / perPage),
      warnings,
    };
  });
}

/** PDF de un trabajo de impresión: usa la plantilla y los precios guardados en ese momento. */
export async function getPrintJobPdf(id: number): Promise<{ pdf: Buffer; fileName: string }> {
  const job = await prisma.printJob.findUnique({
    where: { id },
    include: { items: { include: { product: true }, orderBy: { id: 'asc' } } },
  });
  if (!job) throw notFound('La impresión');
  const snapshot = snapshotSchema.parse(JSON.parse(job.templateSnapshot));

  const labels: LabelProductData[] = [];
  for (const item of job.items) {
    // Los datos del producto son los actuales; el precio es el que se registró al imprimir.
    const label: LabelProductData = {
      name: item.product.name,
      brand: item.product.brand,
      presentation: item.product.presentation,
      sku: item.product.sku,
      barcode: item.product.barcode,
      priceCents: Number(item.priceCents),
    };
    for (let i = 0; i < item.quantity; i++) labels.push(label);
  }

  const date = job.createdAt.toISOString().slice(0, 10);
  const pdf = await renderLabelsPdf({
    template: snapshot,
    labels,
    startPosition: snapshot.startPosition,
    pharmacyName: snapshot.pharmacyName,
    title: `Etiquetas ${date} (impresión ${job.id})`,
  });
  return { pdf, fileName: `etiquetas-${date}-${job.id}.pdf` };
}

async function findPrintJobs(skip: number, take: number): Promise<PrintJobSummary[]> {
  const jobs = await prisma.printJob.findMany({
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    skip,
    take,
    include: { _count: { select: { items: true } } },
  });
  return jobs.map((job) => ({
    id: job.id,
    createdAt: job.createdAt.toISOString(),
    // El nombre guardado en la copia es el que tenía la plantilla al imprimir.
    templateName: snapshotSchema.parse(JSON.parse(job.templateSnapshot)).name,
    labelCount: job.labelCount,
    productCount: job._count.items,
  }));
}

export const listPrintJobs = (limit: number) => findPrintJobs(0, limit);

export async function listPrintJobsPage(query: z.output<typeof paginationQuerySchema>): Promise<Paginated<PrintJobSummary>> {
  const [total, items] = await Promise.all([
    prisma.printJob.count(),
    findPrintJobs((query.page - 1) * query.pageSize, query.pageSize),
  ]);
  return { items, total, page: query.page, pageSize: query.pageSize };
}

export async function getPrintJobDetail(id: number): Promise<PrintJobDetail> {
  const job = await prisma.printJob.findUnique({
    where: { id },
    include: { items: { include: { product: { select: { name: true, priceCents: true } } }, orderBy: { id: 'asc' } } },
  });
  if (!job) throw notFound('La impresión');
  const snapshot = snapshotSchema.parse(JSON.parse(job.templateSnapshot));
  return {
    id: job.id,
    createdAt: job.createdAt.toISOString(),
    templateName: snapshot.name,
    widthMm: snapshot.widthMm,
    heightMm: snapshot.heightMm,
    labelCount: job.labelCount,
    startPosition: snapshot.startPosition,
    items: job.items.map((item) => ({
      productId: item.productId,
      name: item.product.name,
      quantity: item.quantity,
      priceCents: Number(item.priceCents),
      currentPriceCents: Number(item.product.priceCents),
    })),
  };
}
