import { describe, expect, it } from 'vitest';
import { DEFAULT_LABEL_TEMPLATE, type LabelTemplateConfig } from './label.js';
import {
  type LabelElement,
  type LabelProductData,
  type TextElement,
  MIN_BARCODE_MODULE_MM,
  layoutLabel,
  paginateLabels,
} from './label-layout.js';
import { measureTextMm, toPrintableText, wrapText } from './text-metrics.js';

const product: LabelProductData = {
  name: 'Ibuprofeno 400 mg comprimidos recubiertos de liberación prolongada',
  brand: 'Genérico',
  presentation: 'x 20 comprimidos',
  sku: 'IBU-400',
  barcode: '7791234567898',
  priceCents: 1_245_000,
};

const template = (widthMm: number, heightMm: number, changes: Partial<LabelTemplateConfig> = {}) => ({
  widthMm,
  heightMm,
  config: { ...DEFAULT_LABEL_TEMPLATE.config, ...changes },
});

const byRole = (elements: LabelElement[], role: string) =>
  elements.find((e): e is TextElement => e.type === 'text' && e.role === role);

describe('medición y corte de texto', () => {
  it('mide con las métricas de Helvetica', () => {
    // "0" mide 556/1000 em: a 10 pt son 5,56 pt = 1,961 mm.
    expect(measureTextMm('0', 'regular', 10)).toBeCloseTo(1.9614, 3);
    expect(measureTextMm('WW', 'bold', 10)).toBeGreaterThan(measureTextMm('ii', 'bold', 10));
  });

  it('corta entre palabras y agrega "…" si no entra', () => {
    const lines = wrapText('Ibuprofeno 400 mg comprimidos recubiertos', 25, 'bold', 9, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1]!.endsWith('…')).toBe(true);
    for (const line of lines) expect(measureTextMm(line, 'bold', 9)).toBeLessThanOrEqual(25);
  });

  it('corta palabras larguísimas por caracteres', () => {
    const lines = wrapText('Superlargapalabrasinespacios', 10, 'regular', 9, 5);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(measureTextMm(line, 'regular', 9)).toBeLessThanOrEqual(10);
  });

  it('conserva acentos y ñ pero reemplaza lo que el PDF no puede imprimir', () => {
    expect(toPrintableText('Ñandú  ¿crema?  €5 💊')).toBe('Ñandú ¿crema? €5 ?');
  });
});

describe('layoutLabel', () => {
  it('ubica todos los elementos de la plantilla estándar', () => {
    const layout = layoutLabel(product, template(60, 35), { pharmacyName: 'Farmacia Central' });
    const roles = layout.elements.map((e) => (e.type === 'text' ? e.role : e.type));
    expect(roles).toEqual(['rect', 'name', 'details', 'bars', 'barcodeText', 'sku', 'price']);
    expect(byRole(layout.elements, 'price')!.lines[0]!.text).toBe('$ 12.450,00');
    expect(byRole(layout.elements, 'details')!.lines[0]!.text).toBe('Genérico · x 20 comprimidos');
    expect(layout.warnings).toEqual([]);
  });

  it.each([
    [60, 35],
    [38, 21],
    [50, 30],
    [100, 50],
    [30, 60],
  ])('en %i × %i mm nada se sale de la etiqueta ni se superpone con el precio', (w, h) => {
    const layout = layoutLabel(product, template(w, h));
    for (const element of layout.elements) {
      expect(element.x).toBeGreaterThanOrEqual(0);
      expect(element.y).toBeGreaterThanOrEqual(0);
      expect(element.x + element.width).toBeLessThanOrEqual(w + 1e-6);
      expect(element.y + element.height).toBeLessThanOrEqual(h + 1e-6);
    }
    const price = byRole(layout.elements, 'price')!;
    const name = byRole(layout.elements, 'name')!;
    expect(price.y).toBeGreaterThanOrEqual(name.y + name.height - 1e-6);
    const priceWidth = measureTextMm(price.lines[0]!.text, 'bold', price.fontSizePt);
    expect(priceWidth).toBeLessThanOrEqual(price.width + 1e-6);
  });

  it('respeta el tamaño de precio configurado si hay lugar', () => {
    const layout = layoutLabel(product, template(100, 60));
    expect(byRole(layout.elements, 'price')!.fontSizePt).toBe(22);
  });

  it('achica el precio si no entra a lo ancho', () => {
    const layout = layoutLabel({ ...product, priceCents: 99_999_999_99 }, template(40, 30));
    const price = byRole(layout.elements, 'price')!;
    expect(price.fontSizePt).toBeLessThan(22);
    expect(measureTextMm(price.lines[0]!.text, 'bold', price.fontSizePt)).toBeLessThanOrEqual(price.width);
  });

  it('el código de barras respeta el módulo mínimo y sus márgenes en blanco', () => {
    const layout = layoutLabel(product, template(38, 25));
    const bars = layout.elements.find((e) => e.type === 'bars')!;
    expect(bars.type === 'bars' && bars.moduleWidthMm).toBeGreaterThanOrEqual(MIN_BARCODE_MODULE_MM);
    expect(bars.x).toBeGreaterThanOrEqual(11 * (bars.type === 'bars' ? bars.moduleWidthMm : 0));
  });

  it('omite el código de barras si la etiqueta es muy angosta y lo avisa', () => {
    const layout = layoutLabel(product, template(25, 30));
    expect(layout.elements.some((e) => e.type === 'bars')).toBe(false);
    expect(layout.warnings[0]).toContain('muy angosta');
  });

  it('respeta los campos desactivados', () => {
    const config = {
      fields: { showBrand: false, showPresentation: false, showBarcode: false, showSku: false, showPharmacyName: false },
      style: { ...DEFAULT_LABEL_TEMPLATE.config.style, showCutGuides: false },
    };
    const layout = layoutLabel(product, template(60, 35, config), { pharmacyName: 'Farmacia' });
    expect(layout.elements.map((e) => (e.type === 'text' ? e.role : e.type))).toEqual(['name', 'price']);
  });

  it('muestra el nombre de la farmacia solo si está activado y cargado', () => {
    const config = { fields: { ...DEFAULT_LABEL_TEMPLATE.config.fields, showPharmacyName: true } };
    expect(byRole(layoutLabel(product, template(60, 35, config), { pharmacyName: 'Farmacia Central' }).elements, 'pharmacy'))
      .toBeDefined();
    expect(byRole(layoutLabel(product, template(60, 35, config), { pharmacyName: '  ' }).elements, 'pharmacy')).toBeUndefined();
  });

  it('en etiquetas bajas resigna primero marca/presentación y lo avisa', () => {
    const layout = layoutLabel(product, template(38, 21));
    expect(byRole(layout.elements, 'details')).toBeUndefined();
    expect(byRole(layout.elements, 'price')!.fontSizePt).toBeGreaterThanOrEqual(8);
    expect(layout.warnings[0]).toContain('Se omitió');
  });

  it('como último recurso resigna el código de barras', () => {
    const layout = layoutLabel(product, template(60, 14));
    expect(layout.elements.some((e) => e.type === 'bars')).toBe(false);
    expect(layout.warnings[0]).toContain('código de barras');
  });

  it('avisa si el precio queda ilegible aun resignando todo', () => {
    const layout = layoutLabel(product, template(60, 9));
    expect(layout.warnings.join(' ')).toContain('precio queda muy chico');
  });

  it('no dibuja códigos de barras inválidos o GTIN-14 y lo avisa', () => {
    const layout = layoutLabel({ ...product, barcode: '10012345678902' }, template(60, 35));
    expect(layout.elements.some((e) => e.type === 'bars')).toBe(false);
    expect(layout.warnings[0]).toContain('no se puede dibujar');
  });
});

describe('paginateLabels', () => {
  it('reparte en hojas y deja vacías las primeras posiciones', () => {
    expect(paginateLabels(['a', 'b', 'c', 'd', 'e'], 3, 2)).toEqual([
      [null, 'a', 'b'],
      ['c', 'd', 'e'],
    ]);
  });

  it('la posición inicial se limita a la hoja', () => {
    expect(paginateLabels(['a'], 3, 99)).toEqual([[null, null, 'a']]);
    expect(paginateLabels(['a', 'b'], 3, 0)).toEqual([['a', 'b']]);
  });
});
