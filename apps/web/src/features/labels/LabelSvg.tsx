import { type LabelLayout, PT_TO_MM, computeSheetLayout, type LabelTemplateShape } from '@etiquetas/shared';

const FONT_FAMILY = 'Helvetica, Arial, sans-serif';
const ANCHORS = { left: 'start', center: 'middle', right: 'end' } as const;

/**
 * Dibuja los elementos de una etiqueta en SVG, en milímetros. Usa el mismo diseño que el PDF
 * (layoutLabel); Arial y Helvetica tienen las mismas medidas, así que se ve igual que impreso.
 */
export function LabelContent({ layout }: { layout: LabelLayout }) {
  return (
    <>
      <rect width={layout.widthMm} height={layout.heightMm} fill="white" />
      {layout.elements.map((element, index) => {
        switch (element.type) {
          case 'rect':
            return (
              <rect
                key={index}
                x={element.x}
                y={element.y}
                width={element.width}
                height={element.height}
                fill="none"
                stroke="#9ca3af"
                strokeWidth={0.1}
                strokeDasharray="0.7 0.7"
              />
            );
          case 'bars':
            return (
              <g key={index} fill="black">
                {element.bars.map((bar) => (
                  <rect
                    key={bar.start}
                    x={element.x + bar.start * element.moduleWidthMm}
                    y={element.y}
                    width={bar.width * element.moduleWidthMm}
                    height={element.height}
                  />
                ))}
              </g>
            );
          case 'text': {
            const x =
              element.align === 'left'
                ? element.x
                : element.align === 'right'
                  ? element.x + element.width
                  : element.x + element.width / 2;
            return (
              <g
                key={index}
                fontFamily={FONT_FAMILY}
                fontSize={element.fontSizePt * PT_TO_MM}
                fontWeight={element.weight === 'bold' ? 700 : 400}
                fill={element.color}
                textAnchor={ANCHORS[element.align]}
              >
                {element.lines.map((line, i) => (
                  <text key={i} x={x} y={line.baselineMm}>
                    {line.text}
                  </text>
                ))}
              </g>
            );
          }
        }
      })}
    </>
  );
}

export function LabelSvg({ layout, className }: { layout: LabelLayout; className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${layout.widthMm} ${layout.heightMm}`}
      className={className}
      role="img"
      aria-label="Vista previa de la etiqueta"
    >
      <LabelContent layout={layout} />
    </svg>
  );
}

/** Hoja completa: cada lugar con su etiqueta o vacío (null). */
export function SheetSvg({
  template,
  slots,
  className,
}: {
  template: LabelTemplateShape;
  slots: (LabelLayout | null)[];
  className?: string;
}) {
  const { sheet } = template.config;
  const { positions } = computeSheetLayout(template.widthMm, template.heightMm, sheet);
  return (
    <svg
      viewBox={`0 0 ${sheet.pageWidthMm} ${sheet.pageHeightMm}`}
      className={className}
      role="img"
      aria-label="Vista previa de la hoja"
    >
      <rect width={sheet.pageWidthMm} height={sheet.pageHeightMm} fill="white" />
      {positions.map((position, index) => {
        const layout = slots[index];
        return (
          <g key={index} transform={`translate(${position.xMm} ${position.yMm})`}>
            {layout ? (
              <LabelContent layout={layout} />
            ) : (
              <rect
                width={template.widthMm}
                height={template.heightMm}
                fill="#f8fafc"
                stroke="#e2e8f0"
                strokeWidth={0.3}
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}
