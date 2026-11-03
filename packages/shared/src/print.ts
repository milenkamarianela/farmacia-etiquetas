import { z } from 'zod';
import type { LabelTemplateConfig } from './label.js';

export interface LabelTemplateDto {
  id: number;
  name: string;
  widthMm: number;
  heightMm: number;
  config: LabelTemplateConfig;
  isDefault: boolean;
  createdAt: string;
  /** Etiquetas por hoja con la configuración actual. 0 si no entra ninguna. */
  perPage: number;
  /** Si ya se usó para imprimir (en ese caso no se puede borrar). */
  usedInPrintJobs: boolean;
}

export const MAX_LABELS_PER_JOB = 10_000;

export const printJobInputSchema = z
  .object({
    templateId: z.number().int().positive(),
    items: z
      .array(
        z.object({
          productId: z.number().int().positive(),
          quantity: z.number().int().min(1, 'Mínimo 1 etiqueta').max(500, 'Máximo 500 etiquetas por producto'),
        }),
      )
      .min(1, 'Agregá al menos un producto')
      .max(5000),
    /** Posición de la primera etiqueta en la primera hoja (para hojas autoadhesivas ya usadas). */
    startPosition: z.number().int().min(1).default(1),
    /** Marca los productos como impresos con el precio actual (deja de figurar "precio cambiado"). */
    markAsPrinted: z.boolean().default(true),
  })
  .refine((job) => job.items.reduce((sum, item) => sum + item.quantity, 0) <= MAX_LABELS_PER_JOB, {
    message: `Máximo ${MAX_LABELS_PER_JOB} etiquetas por impresión`,
    path: ['items'],
  });

export type PrintJobInput = z.input<typeof printJobInputSchema>;

export interface PrintJobCreated {
  id: number;
  labelCount: number;
  pageCount: number;
  warnings: string[];
}

export const settingsSchema = z.object({
  pharmacyName: z.string().trim().max(80, 'Máximo 80 caracteres'),
});
export type Settings = z.infer<typeof settingsSchema>;
