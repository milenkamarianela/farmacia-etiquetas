import PDFDocument from 'pdfkit';
import {
  type LabelLayout,
  type LabelProductData,
  type LabelTemplateShape,
  computeSheetLayout,
  layoutLabel,
  paginateLabels,
} from '@etiquetas/shared';

/** Milímetros → puntos PDF (1 pt = 1/72 pulgada). Todas las medidas se convierten sin escalados. */
export const MM_TO_PT = 72 / 25.4;
const pt = (mm: number) => mm * MM_TO_PT;

const FONTS = { regular: 'Helvetica', bold: 'Helvetica-Bold' } as const;
const RULER_LENGTH_MM = 100;

function drawLabel(doc: PDFKit.PDFDocument, layout: LabelLayout, originXMm: number, originYMm: number) {
  doc.save();
  doc.translate(pt(originXMm), pt(originYMm));

  for (const element of layout.elements) {
    switch (element.type) {
      case 'rect':
        doc
          .lineWidth(0.3)
          .strokeColor('#9ca3af')
          .dash(2, { space: 2 })
          .rect(pt(element.x), pt(element.y), pt(element.width), pt(element.height))
          .stroke()
          .undash();
        break;
      case 'bars':
        for (const bar of element.bars) {
          doc.rect(
            pt(element.x + bar.start * element.moduleWidthMm),
            pt(element.y),
            pt(bar.width * element.moduleWidthMm),
            pt(element.height),
          );
        }
        doc.fillColor('#000000').fill();
        break;
      case 'text': {
        doc.font(FONTS[element.weight]).fontSize(element.fontSizePt).fillColor(element.color);
        for (const line of element.lines) {
          // La alineación usa el ancho real de PDFKit (con interletrado), siempre ≤ al medido en el diseño.
          const width = doc.widthOfString(line.text);
          const x =
            element.align === 'left'
              ? pt(element.x)
              : element.align === 'right'
                ? pt(element.x + element.width) - width
                : pt(element.x + element.width / 2) - width / 2;
          doc.text(line.text, x, pt(line.baselineMm), { lineBreak: false, baseline: 'alphabetic' });
        }
        break;
      }
    }
  }
  doc.restore();
}

/**
 * Regla de control en el margen superior de la primera hoja: si impresa no mide 100 mm,
 * la impresora está escalando (hay que elegir "Tamaño real" o "100 %").
 */
function drawRuler(doc: PDFKit.PDFDocument, template: LabelTemplateShape) {
  const { sheet } = template.config;
  if (sheet.marginTopMm < 7 || sheet.pageWidthMm - sheet.marginLeftMm * 2 < RULER_LENGTH_MM) return;
  const x = sheet.marginLeftMm;
  const y = sheet.marginTopMm / 2;
  doc.save().lineWidth(0.4).strokeColor('#6b7280');
  doc.moveTo(pt(x), pt(y)).lineTo(pt(x + RULER_LENGTH_MM), pt(y)).stroke();
  for (let mm = 0; mm <= RULER_LENGTH_MM; mm += 10) {
    const tick = mm % 50 === 0 ? 1.5 : 0.8;
    doc.moveTo(pt(x + mm), pt(y - tick)).lineTo(pt(x + mm), pt(y)).stroke();
  }
  doc
    .font(FONTS.regular)
    .fontSize(6)
    .fillColor('#6b7280')
    .text(
      'Control de escala: esta línea debe medir 100 mm. Si no, imprimí en «Tamaño real» (100 %).',
      pt(x + RULER_LENGTH_MM + 3),
      pt(y),
      { lineBreak: false, baseline: 'middle' },
    );
  doc.restore();
}

/** Genera el PDF de una hoja (o varias) de etiquetas con las medidas físicas exactas de la plantilla. */
export function renderLabelsPdf(params: {
  template: LabelTemplateShape;
  labels: LabelProductData[];
  startPosition: number;
  pharmacyName: string;
  title: string;
}): Promise<Buffer> {
  const { template, labels } = params;
  const { sheet } = template.config;
  const sheetLayout = computeSheetLayout(template.widthMm, template.heightMm, sheet);
  const pages = paginateLabels(labels, sheetLayout.perPage, params.startPosition);

  const doc = new PDFDocument({
    size: [pt(sheet.pageWidthMm), pt(sheet.pageHeightMm)],
    margin: 0,
    autoFirstPage: false,
    info: { Title: params.title, Creator: 'Etiquetas de góndola' },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  // El mismo producto suele repetirse varias veces: su diseño se calcula una sola vez.
  const layouts = new Map<LabelProductData, LabelLayout>();
  const layoutFor = (label: LabelProductData) => {
    let layout = layouts.get(label);
    if (!layout) {
      layout = layoutLabel(label, template, { pharmacyName: params.pharmacyName });
      layouts.set(label, layout);
    }
    return layout;
  };

  pages.forEach((slots, pageIndex) => {
    doc.addPage();
    if (pageIndex === 0) drawRuler(doc, template);
    slots.forEach((label, slot) => {
      if (!label) return;
      const position = sheetLayout.positions[slot]!;
      drawLabel(doc, layoutFor(label), position.xMm, position.yMm);
    });
  });

  doc.end();
  return done;
}
