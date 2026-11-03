import type { ImportRow, ImportRowResult } from '@etiquetas/shared';

function csvField(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[";\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * CSV con las filas rechazadas tal como venían en el archivo, más el motivo.
 * Usa ";" y BOM para que Excel en español lo abra directamente con acentos correctos.
 * Así se pueden corregir y volver a importar.
 */
export function buildRejectedCsv(headers: string[], rows: ImportRow[], results: ImportRowResult[]): string {
  const cellsByRow = new Map(rows.map((row) => [row.rowNumber, row.cells]));
  const lines = [['Fila', ...headers, 'Motivo del rechazo'].map(csvField).join(';')];
  for (const result of results) {
    if (result.action !== 'reject') continue;
    const cells = cellsByRow.get(result.rowNumber) ?? [];
    lines.push([result.rowNumber, ...headers.map((_, i) => cells[i] ?? ''), result.errors.join(' | ')].map(csvField).join(';'));
  }
  return `﻿${lines.join('\r\n')}\r\n`;
}

export function downloadText(content: string, fileName: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
