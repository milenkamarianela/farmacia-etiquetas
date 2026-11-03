// Genera src/fonts/helvetica-metrics.ts con el ancho de cada carácter de Helvetica y Helvetica-Bold
// (fuentes estándar de PDF que usa PDFKit). Así el diseño de la etiqueta mide los textos igual que el PDF.
// Uso (desde la raíz del proyecto): node packages/shared/scripts/generate-helvetica-metrics.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';

const doc = new PDFDocument();
// Caracteres que las fuentes estándar de PDF pueden imprimir: Windows-1252 (WinAnsi).
const bytes = [];
for (let b = 32; b <= 255; b++) if (b !== 127) bytes.push(b);
const decoder = new TextDecoder('windows-1252');
const chars = [...new Set(bytes.map((b) => decoder.decode(Uint8Array.of(b))))].filter((c) => c.length === 1);

function widths(font) {
  doc.font(font).fontSize(1000);
  return Object.fromEntries(chars.map((c) => [c, Math.round(doc.widthOfString(c))]));
}

const metrics = {
  regular: widths('Helvetica'),
  bold: widths('Helvetica-Bold'),
};

const output = `// ARCHIVO GENERADO por scripts/generate-helvetica-metrics.mjs — no editar a mano.
// Anchos de carácter (en milésimas de em) de Helvetica y Helvetica-Bold según las métricas AFM de Adobe
// incluidas en PDFKit. Solo contiene los caracteres imprimibles con las fuentes estándar de PDF (WinAnsi).

export const HELVETICA_ASCENT = 0.718;
export const HELVETICA_DESCENT = 0.207;

export const HELVETICA_WIDTHS: Record<'regular' | 'bold', Record<string, number>> = ${JSON.stringify(metrics, null, 2)};
`;

const target = fileURLToPath(new URL('../src/fonts/helvetica-metrics.ts', import.meta.url));
writeFileSync(target, output);
console.log(`Escrito ${target} (${chars.length} caracteres por fuente)`);
