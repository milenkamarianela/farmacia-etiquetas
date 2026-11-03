import { type BarRun, encodeBarcode, modulesToBars } from './barcode-encoding.js';
import { HELVETICA_ASCENT, HELVETICA_DESCENT } from './fonts/helvetica-metrics.js';
import type { LabelTemplateConfig } from './label.js';
import { formatARS } from './money.js';
import { type FontWeight, PT_TO_MM, measureTextMm, toPrintableText, wrapText } from './text-metrics.js';

/**
 * Diseño de una etiqueta: calcula, en milímetros, dónde va cada elemento.
 * La vista previa (navegador) y el PDF (servidor) solo dibujan esta lista de elementos,
 * así lo que se ve en pantalla es lo que se imprime. Es también la base del futuro diseñador visual.
 */

export const LINE_HEIGHT = 1.15;
/** Ancho mínimo de módulo del código de barras para que los lectores lo lean bien. */
export const MIN_BARCODE_MODULE_MM = 0.22;
/** Ancho de módulo nominal GS1 (100 %). */
export const NOMINAL_BARCODE_MODULE_MM = 0.33;
const SMALL_FONT_PT = 6;
const MIN_PRICE_FONT_PT = 8;

export interface LabelProductData {
  name: string;
  brand: string | null;
  presentation: string | null;
  sku: string | null;
  barcode: string | null;
  priceCents: number;
}

export interface LabelTemplateShape {
  widthMm: number;
  heightMm: number;
  config: LabelTemplateConfig;
}

export type TextRole = 'pharmacy' | 'name' | 'details' | 'price' | 'barcodeText' | 'sku';

export interface TextLine {
  text: string;
  /** Línea base del texto, medida desde el borde superior de la etiqueta. */
  baselineMm: number;
}

export interface TextElement {
  type: 'text';
  role: TextRole;
  x: number;
  y: number;
  width: number;
  height: number;
  align: 'left' | 'center' | 'right';
  fontSizePt: number;
  weight: FontWeight;
  color: string;
  lines: TextLine[];
}

export interface BarsElement {
  type: 'bars';
  /** Inicio del símbolo (sin el margen en blanco obligatorio, que ya está reservado alrededor). */
  x: number;
  y: number;
  width: number;
  height: number;
  moduleWidthMm: number;
  bars: BarRun[];
}

export interface RectElement {
  type: 'rect';
  role: 'cutGuide';
  x: number;
  y: number;
  width: number;
  height: number;
}

export type LabelElement = TextElement | BarsElement | RectElement;

export interface LabelLayout {
  widthMm: number;
  heightMm: number;
  elements: LabelElement[];
  /** Problemas de espacio (por ejemplo, precio muy chico). La etiqueta se genera igual. */
  warnings: string[];
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const lineHeightMm = (fontSizePt: number) => fontSizePt * PT_TO_MM * LINE_HEIGHT;
const round = (value: number) => Math.round(value * 1000) / 1000;

function textElement(
  role: TextRole,
  lines: string[],
  box: { x: number; y: number; width: number },
  style: { fontSizePt: number; weight: FontWeight; align: TextElement['align']; color: string },
): TextElement {
  const lineHeight = lineHeightMm(style.fontSizePt);
  const sizeMm = style.fontSizePt * PT_TO_MM;
  // La línea base queda centrada verticalmente en el renglón (como en CSS con line-height).
  const firstBaseline = box.y + (lineHeight - (HELVETICA_ASCENT + HELVETICA_DESCENT) * sizeMm) / 2 + HELVETICA_ASCENT * sizeMm;
  return {
    type: 'text',
    role,
    x: round(box.x),
    y: round(box.y),
    width: round(box.width),
    height: round(lines.length * lineHeight),
    ...style,
    lines: lines.map((text, i) => ({ text, baselineMm: round(firstBaseline + i * lineHeight) })),
  };
}

/** Qué se dibuja en un intento de diseño. Si el precio no entra, se va resignando contenido secundario. */
interface Attempt {
  details: boolean;
  nameLines: 1 | 2;
  barcode: boolean;
  note: string | null;
}

const ATTEMPTS: Attempt[] = [
  { details: true, nameLines: 2, barcode: true, note: null },
  { details: false, nameLines: 2, barcode: true, note: 'Se omitió marca y presentación por falta de espacio' },
  { details: false, nameLines: 1, barcode: true, note: 'Se omitió marca y presentación, y el nombre va en un renglón' },
  { details: false, nameLines: 1, barcode: false, note: 'Se omitió el código de barras, la marca y la presentación por falta de espacio' },
];

export function layoutLabel(
  product: LabelProductData,
  template: LabelTemplateShape,
  options: { pharmacyName?: string | null } = {},
): LabelLayout {
  let last: { layout: LabelLayout; priceSize: number } | null = null;
  for (const attempt of ATTEMPTS) {
    const result = buildLayout(product, template, options, attempt);
    // Se usa el primer intento donde el precio es legible. Los intentos que no cambian nada se saltean.
    if (result.priceSize >= MIN_PRICE_FONT_PT) {
      if (attempt.note && last) result.layout.warnings.unshift(attempt.note);
      return result.layout;
    }
    last = result;
  }
  const { layout, priceSize } = last!;
  layout.warnings.push(
    `El precio queda muy chico (${Math.max(priceSize, 0)} pt): agrandá la etiqueta, achicá el nombre o quitá elementos`,
  );
  return layout;
}

function buildLayout(
  product: LabelProductData,
  template: LabelTemplateShape,
  options: { pharmacyName?: string | null },
  attempt: Attempt,
): { layout: LabelLayout; priceSize: number } {
  const { widthMm: w, heightMm: h, config } = template;
  const { fields, style } = config;
  const elements: LabelElement[] = [];
  const warnings: string[] = [];

  const pad = clamp(Math.min(w, h) * 0.06, 1.5, 3);
  const innerW = w - pad * 2;
  const bottom = h - pad;
  let y = pad;

  if (style.showCutGuides) elements.push({ type: 'rect', role: 'cutGuide', x: 0, y: 0, width: w, height: h });

  // Encabezado: nombre de la farmacia.
  const pharmacyName = options.pharmacyName ? toPrintableText(options.pharmacyName) : '';
  if (fields.showPharmacyName && pharmacyName) {
    const fontSizePt = clamp(style.nameFontSizePt - 3, 5, 8);
    const lines = wrapText(pharmacyName, innerW, 'bold', fontSizePt, 1);
    const element = textElement('pharmacy', lines, { x: pad, y, width: innerW }, {
      fontSizePt,
      weight: 'bold',
      align: 'center',
      color: '#047857',
    });
    elements.push(element);
    y += element.height + 0.3;
  }

  // Nombre del producto (hasta 2 renglones).
  const nameLines = wrapText(toPrintableText(product.name), innerW, 'bold', style.nameFontSizePt, attempt.nameLines);
  const nameElement = textElement('name', nameLines, { x: pad, y, width: innerW }, {
    fontSizePt: style.nameFontSizePt,
    weight: 'bold',
    align: 'left',
    color: '#111827',
  });
  elements.push(nameElement);
  y += nameElement.height;

  // Marca y presentación.
  const details = [
    attempt.details && fields.showBrand ? product.brand : null,
    attempt.details && fields.showPresentation ? product.presentation : null,
  ]
    .filter((part): part is string => !!part)
    .map(toPrintableText)
    .join(' · ');
  if (details) {
    const fontSizePt = Math.max(5, style.nameFontSizePt - 1.5);
    const element = textElement('details', wrapText(details, innerW, 'regular', fontSizePt, 1), { x: pad, y, width: innerW }, {
      fontSizePt,
      weight: 'regular',
      align: 'left',
      color: '#4b5563',
    });
    elements.push(element);
    y += element.height + 0.3;
  }

  // Franja inferior: código de barras y código interno.
  let bandTop = bottom;
  const smallLine = lineHeightMm(SMALL_FONT_PT);
  const skuText = fields.showSku && product.sku ? toPrintableText(`Cód. ${product.sku}`) : null;
  const wantsBarcode = attempt.barcode && fields.showBarcode && !!product.barcode;
  let encoded = wantsBarcode ? encodeBarcode(product.barcode!) : null;
  if (wantsBarcode && !encoded) {
    warnings.push('El código de barras no se puede dibujar (solo EAN-13, EAN-8 y UPC-A)');
  }

  let skuPlaced = false;
  if (encoded) {
    const totalModules = encoded.quietZoneLeft + encoded.modules.length + encoded.quietZoneRight;
    const moduleWidthMm = Math.min(NOMINAL_BARCODE_MODULE_MM, innerW / totalModules);
    if (moduleWidthMm < MIN_BARCODE_MODULE_MM) {
      warnings.push(
        `La etiqueta es muy angosta para el código de barras (necesita al menos ${Math.ceil(totalModules * MIN_BARCODE_MODULE_MM + pad * 2)} mm de ancho)`,
      );
      encoded = null;
    } else {
      const barHeight = clamp(h * 0.22, 5, 12);
      const symbolX = pad + encoded.quietZoneLeft * moduleWidthMm;
      const symbolW = encoded.modules.length * moduleWidthMm;
      bandTop = bottom - barHeight - smallLine;
      elements.push({
        type: 'bars',
        x: round(symbolX),
        y: round(bandTop),
        width: round(symbolW),
        height: round(barHeight),
        moduleWidthMm: round(moduleWidthMm),
        bars: modulesToBars(encoded.modules),
      });
      elements.push(
        textElement('barcodeText', [encoded.text], { x: symbolX, y: bandTop + barHeight, width: symbolW }, {
          fontSizePt: SMALL_FONT_PT,
          weight: 'regular',
          align: 'center',
          color: '#111827',
        }),
      );

      // El código interno va a la derecha del código de barras si hay lugar.
      const freeX = pad + totalModules * moduleWidthMm + 1;
      const freeW = w - pad - freeX;
      if (skuText && measureTextMm(skuText, 'regular', SMALL_FONT_PT) <= freeW) {
        elements.push(
          textElement('sku', [skuText], { x: freeX, y: bottom - smallLine, width: freeW }, {
            fontSizePt: SMALL_FONT_PT,
            weight: 'regular',
            align: 'right',
            color: '#4b5563',
          }),
        );
        skuPlaced = true;
      }
    }
  }
  if (skuText && !skuPlaced) {
    bandTop -= smallLine;
    elements.push(
      textElement('sku', wrapText(skuText, innerW, 'regular', SMALL_FONT_PT, 1), { x: pad, y: bandTop, width: innerW }, {
        fontSizePt: SMALL_FONT_PT,
        weight: 'regular',
        align: encoded ? 'left' : 'right',
        color: '#4b5563',
      }),
    );
  }

  // Precio: lo más grande posible hasta el tamaño configurado, apoyado sobre la franja inferior.
  const priceText = formatARS(product.priceCents);
  const zoneTop = y + 0.3;
  const zoneBottom = bandTop - 0.3;
  const fitByWidth = innerW / measureTextMm(priceText, 'bold', 1);
  const fitByHeight = (zoneBottom - zoneTop) / lineHeightMm(1);
  const priceSize = Math.floor(Math.min(style.priceFontSizePt, fitByWidth, fitByHeight) * 2) / 2;
  // Si ni así entra, se dibuja igual en un tamaño mínimo (el aviso lo agrega layoutLabel).
  const drawnSize = Math.max(priceSize, 4);
  elements.push(
    textElement('price', [priceText], { x: pad, y: Math.max(zoneBottom - lineHeightMm(drawnSize), 0), width: innerW }, {
      fontSizePt: drawnSize,
      weight: 'bold',
      align: 'right',
      color: '#000000',
    }),
  );

  return { layout: { widthMm: w, heightMm: h, elements, warnings }, priceSize };
}

/**
 * Reparte las etiquetas en hojas. `startPosition` (desde 1) permite aprovechar una hoja de etiquetas
 * autoadhesivas ya usada en parte: las primeras posiciones de la primera hoja quedan vacías (null).
 */
export function paginateLabels<T>(labels: T[], perPage: number, startPosition = 1): (T | null)[][] {
  if (perPage < 1) throw new Error('perPage debe ser al menos 1');
  const offset = clamp(Math.floor(startPosition) - 1, 0, perPage - 1);
  const slots: (T | null)[] = [...Array<null>(offset).fill(null), ...labels];
  const pages: (T | null)[][] = [];
  for (let i = 0; i < slots.length; i += perPage) pages.push(slots.slice(i, i + perPage));
  return pages;
}
