import { z } from 'zod';
import { HttpError } from './errors.js';

const idSchema = z.coerce.number().int().positive();

/** Lee un id numérico de la URL; responde 404 si no es válido (no puede existir ese registro). */
export function parseId(raw: string | undefined, what: string): number {
  const result = idSchema.safeParse(raw);
  if (!result.success) throw new HttpError(404, `${what} no existe`);
  return result.data;
}
