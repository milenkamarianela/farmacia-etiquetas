import { DEFAULT_LABEL_TEMPLATE, layoutLabel } from '@etiquetas/shared';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LabelSvg, SheetSvg } from './LabelSvg';

const product = {
  name: 'Ibuprofeno 400 mg',
  brand: 'Genérico',
  presentation: 'x 10',
  sku: 'IBU-400',
  barcode: '7791234567898',
  priceCents: 1_245_000,
};

describe('vista previa de etiquetas', () => {
  it('dibuja en milímetros los mismos elementos que el PDF', () => {
    const layout = layoutLabel(product, DEFAULT_LABEL_TEMPLATE);
    const { container } = render(<LabelSvg layout={layout} />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('viewBox')).toBe('0 0 60 35');
    expect(container.textContent).toContain('$ 12.450,00');
    expect(container.textContent).toContain('7791234567898');

    const bars = layout.elements.find((e) => e.type === 'bars');
    // Un rectángulo por barra (EAN-13 tiene 30 barras) + el fondo blanco.
    expect(bars?.type === 'bars' && bars.bars).toHaveLength(30);
    expect(container.querySelectorAll('g[fill="black"] rect')).toHaveLength(30);
  });

  it('la hoja deja vacíos los lugares sin etiqueta', () => {
    const layout = layoutLabel(product, DEFAULT_LABEL_TEMPLATE);
    const { container } = render(<SheetSvg template={DEFAULT_LABEL_TEMPLATE} slots={[null, layout]} />);
    expect(container.querySelectorAll('svg > g')).toHaveLength(21);
    expect(container.querySelectorAll('rect[fill="#f8fafc"]')).toHaveLength(20);
  });
});
