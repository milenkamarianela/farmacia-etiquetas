import { HELVETICA_WIDTHS } from './fonts/helvetica-metrics.js';

export type FontWeight = 'regular' | 'bold';

/** 1 punto tipográfico en milímetros. */
export const PT_TO_MM = 25.4 / 72;
const ELLIPSIS = '…';

/**
 * Reemplaza los caracteres que las fuentes estándar de PDF no pueden imprimir (emojis, símbolos raros)
 * para que la etiqueta impresa no muestre basura. Las comillas tipográficas, acentos, ñ, ¿ ¡ y € sí se admiten.
 */
export function toPrintableText(text: string): string {
  let result = '';
  for (const char of text.normalize('NFC').replace(/\s+/g, ' ')) {
    result += char in HELVETICA_WIDTHS.regular ? char : '?';
  }
  return result.trim();
}

/** Ancho de un texto en milímetros con Helvetica (sin interletrado; el texto real nunca queda más ancho). */
export function measureTextMm(text: string, weight: FontWeight, fontSizePt: number): number {
  const widths = HELVETICA_WIDTHS[weight];
  let units = 0;
  for (const char of text) units += widths[char] ?? widths['?']!;
  return (units / 1000) * fontSizePt * PT_TO_MM;
}

function truncateToWidth(text: string, maxWidthMm: number, weight: FontWeight, fontSizePt: number): string {
  if (measureTextMm(text, weight, fontSizePt) <= maxWidthMm) return text;
  let cut = text;
  while (cut.length > 0 && measureTextMm(cut.trimEnd() + ELLIPSIS, weight, fontSizePt) > maxWidthMm) {
    cut = cut.slice(0, -1);
  }
  return cut.trimEnd() + ELLIPSIS;
}

/**
 * Divide un texto en líneas que entran en el ancho dado (cortando entre palabras).
 * Si no alcanza `maxLines`, la última línea termina en "…".
 */
export function wrapText(
  text: string,
  maxWidthMm: number,
  weight: FontWeight,
  fontSizePt: number,
  maxLines: number,
): string[] {
  const fits = (line: string) => measureTextMm(line, weight, fontSizePt) <= maxWidthMm;
  const words = text.split(' ').filter(Boolean);
  const lines: string[] = [];
  let current = '';

  for (let index = 0; index < words.length; index++) {
    let word = words[index]!;
    const candidate = current ? `${current} ${word}` : word;
    if (fits(candidate)) {
      current = candidate;
      continue;
    }
    if (current) {
      lines.push(current);
      current = '';
    }
    // Una palabra que no entra sola en una línea se corta por caracteres.
    while (!fits(word)) {
      let cut = word.length - 1;
      while (cut > 1 && !fits(word.slice(0, cut))) cut--;
      lines.push(word.slice(0, cut));
      word = word.slice(cut);
    }
    current = word;
  }
  if (current) lines.push(current);

  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  const rest = lines.slice(maxLines - 1).join(' ');
  kept[maxLines - 1] = truncateToWidth(rest, maxWidthMm, weight, fontSizePt);
  return kept;
}
