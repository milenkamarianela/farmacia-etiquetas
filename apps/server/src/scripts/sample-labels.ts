/**
 * Genera una hoja de etiquetas de muestra (sin tocar la base de datos) para probar la impresora:
 * medidas, escala y lectura del código de barras.
 * Uso: npm run labels:sample -- [archivo.pdf] [ancho_mm] [alto_mm]
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_LABEL_TEMPLATE, type LabelProductData } from '@etiquetas/shared';
import { renderLabelsPdf } from '../modules/print-jobs/pdf.js';

const [output = 'etiquetas-muestra.pdf', width, height] = process.argv.slice(2);

const samples: LabelProductData[] = [
  { name: 'Ibuprofeno 400 mg', brand: 'Genérico', presentation: 'x 10 comprimidos', sku: 'IBU-400', barcode: '7791234567898', priceCents: 1_245_000 },
  { name: 'Protector solar FPS 50 emulsión resistente al agua', brand: 'Sunny', presentation: '200 ml', sku: 'SOL-50', barcode: '4006381333931', priceCents: 6_500_000 },
  { name: 'Algodón hidrófilo', brand: 'Estrella', presentation: '500 g', sku: 'ALG-500', barcode: null, priceCents: 425_050 },
  { name: 'Paracetamol 500 mg', brand: 'Genérico', presentation: 'x 20 comprimidos', sku: 'PARA-500', barcode: '96385074', priceCents: 115_000 },
  { name: 'Shampoo anticaspa con zinc piritiona', brand: 'Clear', presentation: '400 ml', sku: 'SH-1', barcode: '036000291452', priceCents: 99_999_999 },
];

const template = {
  ...DEFAULT_LABEL_TEMPLATE,
  widthMm: width ? Number(width) : DEFAULT_LABEL_TEMPLATE.widthMm,
  heightMm: height ? Number(height) : DEFAULT_LABEL_TEMPLATE.heightMm,
  config: { ...DEFAULT_LABEL_TEMPLATE.config, fields: { ...DEFAULT_LABEL_TEMPLATE.config.fields, showPharmacyName: true } },
};

const labels = Array.from({ length: 24 }, (_, i) => samples[i % samples.length]!);
const pdf = await renderLabelsPdf({
  template,
  labels,
  startPosition: 1,
  pharmacyName: 'Farmacia de muestra',
  title: 'Etiquetas de muestra',
});
await writeFile(output, pdf);
console.log(`Hoja de muestra: ${path.resolve(output)}`);
