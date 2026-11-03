import type { LabelTemplate } from '@prisma/client';
import {
  DEFAULT_LABEL_TEMPLATE,
  type LabelTemplateDto,
  type LabelTemplateShape,
  computeSheetLayout,
  labelTemplateConfigSchema,
  labelTemplateInputSchema,
} from '@etiquetas/shared';
import type { z } from 'zod';
import { prisma } from '../../db.js';
import { HttpError, notFound } from '../../lib/errors.js';

type TemplateInput = z.output<typeof labelTemplateInputSchema>;

/** Lee la configuración guardada (JSON) validándola con el esquema versionado. */
export function toTemplateShape(row: Pick<LabelTemplate, 'widthMm' | 'heightMm' | 'config'>): LabelTemplateShape {
  return {
    widthMm: row.widthMm,
    heightMm: row.heightMm,
    config: labelTemplateConfigSchema.parse(JSON.parse(row.config)),
  };
}

function perPage(shape: LabelTemplateShape): number {
  try {
    return computeSheetLayout(shape.widthMm, shape.heightMm, shape.config.sheet).perPage;
  } catch {
    return 0;
  }
}

function toDto(row: LabelTemplate & { _count: { printJobs: number } }): LabelTemplateDto {
  const shape = toTemplateShape(row);
  return {
    id: row.id,
    name: row.name,
    ...shape,
    isDefault: row.isDefault,
    createdAt: row.createdAt.toISOString(),
    perPage: perPage(shape),
    usedInPrintJobs: row._count.printJobs > 0,
  };
}

const withCount = { _count: { select: { printJobs: true } } } as const;

/** Una plantilla en la que no entra ninguna etiqueta por hoja no sirve: se rechaza al guardar. */
function assertFitsOnSheet(input: TemplateInput): void {
  try {
    computeSheetLayout(input.widthMm, input.heightMm, input.config.sheet);
  } catch (error) {
    throw new HttpError(400, (error as Error).message);
  }
}

/**
 * Garantiza que haya al menos una plantilla (y una predeterminada) para poder imprimir.
 * Se ejecuta al iniciar el servidor; no modifica plantillas existentes.
 */
export async function ensureDefaultTemplate(): Promise<void> {
  if ((await prisma.labelTemplate.count()) === 0) {
    await prisma.labelTemplate.create({
      data: {
        name: DEFAULT_LABEL_TEMPLATE.name,
        widthMm: DEFAULT_LABEL_TEMPLATE.widthMm,
        heightMm: DEFAULT_LABEL_TEMPLATE.heightMm,
        config: JSON.stringify(DEFAULT_LABEL_TEMPLATE.config),
        isDefault: true,
      },
    });
    return;
  }
  if ((await prisma.labelTemplate.count({ where: { isDefault: true } })) === 0) {
    const first = await prisma.labelTemplate.findFirstOrThrow({ orderBy: { name: 'asc' } });
    await prisma.labelTemplate.update({ where: { id: first.id }, data: { isDefault: true } });
  }
}

export async function listTemplates(): Promise<LabelTemplateDto[]> {
  const rows = await prisma.labelTemplate.findMany({
    include: withCount,
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  });
  return rows.map(toDto);
}

export async function getTemplate(id: number): Promise<LabelTemplateDto> {
  const row = await prisma.labelTemplate.findUnique({ where: { id }, include: withCount });
  if (!row) throw notFound('La plantilla');
  return toDto(row);
}

export async function createTemplate(input: TemplateInput): Promise<LabelTemplateDto> {
  assertFitsOnSheet(input);
  const hasDefault = (await prisma.labelTemplate.count({ where: { isDefault: true } })) > 0;
  const row = await prisma.labelTemplate.create({
    data: {
      name: input.name,
      widthMm: input.widthMm,
      heightMm: input.heightMm,
      config: JSON.stringify(input.config),
      isDefault: !hasDefault,
    },
    include: withCount,
  });
  return toDto(row);
}

export async function updateTemplate(id: number, input: TemplateInput): Promise<LabelTemplateDto> {
  assertFitsOnSheet(input);
  if (!(await prisma.labelTemplate.count({ where: { id } }))) throw notFound('La plantilla');
  // Las impresiones anteriores guardan su propia copia de la plantilla: editarla no las altera.
  const row = await prisma.labelTemplate.update({
    where: { id },
    data: { name: input.name, widthMm: input.widthMm, heightMm: input.heightMm, config: JSON.stringify(input.config) },
    include: withCount,
  });
  return toDto(row);
}

export async function setDefaultTemplate(id: number): Promise<LabelTemplateDto> {
  await prisma.$transaction(async (tx) => {
    if (!(await tx.labelTemplate.count({ where: { id } }))) throw notFound('La plantilla');
    await tx.labelTemplate.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    await tx.labelTemplate.update({ where: { id }, data: { isDefault: true } });
  });
  return getTemplate(id);
}

export async function deleteTemplate(id: number): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const row = await tx.labelTemplate.findUnique({ where: { id }, include: withCount });
    if (!row) throw notFound('La plantilla');
    if (row._count.printJobs > 0) {
      throw new HttpError(409, 'Esta plantilla ya se usó para imprimir y figura en el historial: no se puede borrar.');
    }
    if ((await tx.labelTemplate.count()) === 1) {
      throw new HttpError(409, 'Es la única plantilla: creá otra antes de borrarla.');
    }
    await tx.labelTemplate.delete({ where: { id } });
    if (row.isDefault) {
      const next = await tx.labelTemplate.findFirst({ orderBy: { name: 'asc' } });
      if (next) await tx.labelTemplate.update({ where: { id: next.id }, data: { isDefault: true } });
    }
  });
}
