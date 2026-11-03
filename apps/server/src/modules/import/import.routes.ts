import { Router } from 'express';
import multer from 'multer';
import { MAX_IMPORT_FILE_BYTES, importRequestSchema } from '@etiquetas/shared';
import { HttpError } from '../../lib/errors.js';
import { parseImportFile } from './import.parser.js';
import { commitImport, listImportBatches, previewImport } from './import.service.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMPORT_FILE_BYTES, files: 1 },
  // Nombres de archivo con acentos ("Lista de precios - Óptica.xlsx").
  defParamCharset: 'utf8',
}).single('file');

export const importRouter = Router();

importRouter.get('/', async (_req, res) => {
  res.json(await listImportBatches());
});

/** Lee el archivo y devuelve encabezados, filas y una asociación de columnas sugerida. No guarda nada. */
importRouter.post('/parse', (req, res, next) => {
  upload(req, res, async (error: unknown) => {
    try {
      if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
        throw new HttpError(413, `El archivo supera el máximo de ${MAX_IMPORT_FILE_BYTES / 1024 / 1024} MB.`);
      }
      if (error) throw error;
      if (!req.file) throw new HttpError(400, 'No se recibió ningún archivo.');
      const fileName = req.file.originalname;
      const sheet = typeof req.query.sheet === 'string' && req.query.sheet ? req.query.sheet : undefined;
      res.json(await parseImportFile(req.file.buffer, fileName, sheet));
    } catch (caught) {
      next(caught);
    }
  });
});

importRouter.post('/preview', async (req, res) => {
  res.json(await previewImport(importRequestSchema.parse(req.body)));
});

importRouter.post('/commit', async (req, res) => {
  res.status(201).json(await commitImport(importRequestSchema.parse(req.body)));
});
