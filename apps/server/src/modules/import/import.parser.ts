import path from 'node:path';
import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import {
  type CellValue,
  type ImportRow,
  MAX_IMPORT_ROWS,
  type ParsedImportFile,
  headersFromCells,
  suggestMapping,
} from '@etiquetas/shared';
import { HttpError } from '../../lib/errors.js';

/** Convierte el valor de una celda de Excel a texto o número. */
function excelCellToValue(value: ExcelJS.CellValue | undefined): CellValue {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') return value.trim() === '' ? null : value.trim();
  if (typeof value === 'boolean') return value ? 'VERDADERO' : 'FALSO';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if ('richText' in value) return excelCellToValue(value.richText.map((part) => part.text).join(''));
  if ('formula' in value || 'sharedFormula' in value) {
    // Se usa el resultado calculado que Excel guardó en el archivo.
    return excelCellToValue((value as ExcelJS.CellFormulaValue).result as ExcelJS.CellValue);
  }
  if ('text' in value) return excelCellToValue(String(value.text));
  if ('error' in value) return null;
  return String(value);
}

function csvCellToValue(value: string | undefined): CellValue {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

/** Decodifica un CSV: UTF-8 si es válido; si no, Windows-1252 (lo que usa Excel en español al guardar CSV). */
export function decodeCsv(buffer: Buffer): string {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    text = new TextDecoder('windows-1252').decode(buffer);
  }
  return text.replace(/^﻿/, '');
}

interface RawRow {
  rowNumber: number;
  cells: CellValue[];
}

const isEmptyRow = (cells: CellValue[]) => cells.every((cell) => cell === null);

/** La primera fila con datos es el encabezado; el resto son los productos. */
function buildParsedFile(
  fileName: string,
  rawRows: RawRow[],
  sheetNames: string[],
  sheet: string | null,
): ParsedImportFile {
  const nonEmpty = rawRows.filter((row) => !isEmptyRow(row.cells));
  const [headerRow, ...dataRows] = nonEmpty;
  if (!headerRow || dataRows.length === 0) {
    throw new HttpError(400, 'El archivo no tiene datos: se espera una fila de encabezados y al menos un producto.');
  }
  if (dataRows.length > MAX_IMPORT_ROWS) {
    throw new HttpError(400, `El archivo tiene ${dataRows.length} filas; el máximo por importación es ${MAX_IMPORT_ROWS}.`);
  }

  const columnCount = Math.max(...nonEmpty.map((row) => row.cells.length));
  const headers = headersFromCells(headerRow.cells, columnCount);

  const rows: ImportRow[] = dataRows.map((row) => ({
    rowNumber: row.rowNumber,
    cells: Array.from({ length: columnCount }, (_, i) => row.cells[i] ?? null),
  }));

  return {
    fileName,
    sheetNames,
    sheet,
    headerRowNumber: headerRow.rowNumber,
    headers,
    rows,
    suggestedMapping: suggestMapping(headers),
  };
}

async function parseXlsx(buffer: Buffer, fileName: string, requestedSheet?: string): Promise<ParsedImportFile> {
  // Un .xlsx es un ZIP: empieza con "PK".
  if (buffer.subarray(0, 2).toString('latin1') !== 'PK') {
    throw new HttpError(400, 'El archivo no es un Excel .xlsx válido.');
  }
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new HttpError(400, 'No se pudo leer el Excel. ¿Está dañado o protegido con contraseña?');
  }

  const sheetNames = workbook.worksheets.map((ws) => ws.name);
  let worksheet: ExcelJS.Worksheet | undefined;
  if (requestedSheet) {
    worksheet = workbook.getWorksheet(requestedSheet);
    if (!worksheet) throw new HttpError(400, `El Excel no tiene una hoja llamada "${requestedSheet}".`);
  } else {
    worksheet = workbook.worksheets.find((ws) => ws.actualRowCount > 0) ?? workbook.worksheets[0];
  }
  if (!worksheet) throw new HttpError(400, 'El Excel no tiene hojas.');

  const rawRows: RawRow[] = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    // row.values empieza en el índice 1 (la columna A).
    const values = (row.values as ExcelJS.CellValue[]).slice(1);
    rawRows.push({ rowNumber, cells: Array.from(values, excelCellToValue) });
  });
  return buildParsedFile(fileName, rawRows, sheetNames, worksheet.name);
}

function parseCsv(buffer: Buffer, fileName: string): ParsedImportFile {
  const result = Papa.parse<string[]>(decodeCsv(buffer), { skipEmptyLines: false });
  const rawRows: RawRow[] = result.data.map((cells, index) => ({
    rowNumber: index + 1,
    cells: cells.map(csvCellToValue),
  }));
  return buildParsedFile(fileName, rawRows, [], null);
}

export async function parseImportFile(
  buffer: Buffer,
  fileName: string,
  sheet?: string,
): Promise<ParsedImportFile> {
  const extension = path.extname(fileName).toLowerCase();
  switch (extension) {
    case '.xlsx':
      return parseXlsx(buffer, fileName, sheet);
    case '.csv':
    case '.txt':
      return parseCsv(buffer, fileName);
    case '.xls':
      throw new HttpError(
        400,
        'Los archivos .xls (Excel 97-2003) no son compatibles. Abrilo en Excel y usá "Guardar como" → Libro de Excel (.xlsx) o CSV.',
      );
    default:
      throw new HttpError(400, 'Formato no compatible. Subí un archivo Excel (.xlsx) o CSV.');
  }
}
