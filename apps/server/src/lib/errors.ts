import type { ErrorRequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import type { ApiErrorBody } from '@etiquetas/shared';

/** Error con mensaje pensado para mostrarse al usuario. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new HttpError(404, `${what} no existe`);

function zodToBody(error: ZodError): ApiErrorBody {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    (fields[key] ??= []).push(issue.message);
  }
  return { error: 'Hay datos inválidos. Revisá los campos marcados.', fields };
}

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json(zodToBody(error));
    return;
  }
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message } satisfies ApiErrorBody);
    return;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    const target = String(error.meta?.target ?? '');
    const message = target.includes('barcode')
      ? 'Ya existe un producto con ese código de barras'
      : target.includes('sku')
        ? 'Ya existe un producto con ese código interno'
        : 'Ya existe un registro con esos datos';
    res.status(409).json({ error: message } satisfies ApiErrorBody);
    return;
  }
  if (typeof error === 'object' && error !== null && 'type' in error && error.type === 'entity.too.large') {
    res.status(413).json({ error: 'Los datos enviados son demasiado grandes' } satisfies ApiErrorBody);
    return;
  }
  if (error instanceof SyntaxError && 'body' in error) {
    res.status(400).json({ error: 'El cuerpo de la solicitud no es JSON válido' } satisfies ApiErrorBody);
    return;
  }

  console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}:`, error);
  res
    .status(500)
    .json({ error: 'Ocurrió un error inesperado. Si se repite, avisá a soporte con la hora del problema.' } satisfies ApiErrorBody);
};
