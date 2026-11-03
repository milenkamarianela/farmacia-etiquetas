import { validateBarcode } from './barcode.js';

/**
 * Codificación de símbolos EAN-13, UPC-A y EAN-8 (norma GS1).
 * Devuelve la secuencia de módulos ("1" = barra, "0" = espacio) para dibujarla como vectores,
 * igual en la vista previa y en el PDF. Se verifica contra bwip-js en las pruebas.
 */

/** Códigos del lado izquierdo con paridad impar (conjunto A / "L"). */
const L_CODES = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
/** Lado izquierdo con paridad par (conjunto B / "G"): espejo de los códigos R. */
const G_CODES = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
/** Lado derecho (conjunto C / "R"): complemento de los códigos L. */
const R_CODES = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
/** En EAN-13 el primer dígito no se dibuja: define qué paridad usa cada dígito del lado izquierdo. */
const EAN13_PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

const START_END = '101';
const CENTER = '01010';

export type EncodableKind = 'EAN13' | 'EAN8';

export interface EncodedBarcode {
  kind: EncodableKind;
  /** Dígitos tal como se imprimen debajo de las barras. */
  text: string;
  /** Módulos de igual ancho: "1" barra, "0" espacio. EAN-13: 95, EAN-8: 67. */
  modules: string;
  /** Márgenes en blanco obligatorios (en módulos) para que el lector lo reconozca. */
  quietZoneLeft: number;
  quietZoneRight: number;
}

const digit = (char: string) => Number(char);

function encodeEan13(code: string): string {
  const parity = EAN13_PARITY[digit(code[0]!)]!;
  let left = '';
  for (let i = 1; i <= 6; i++) {
    const table = parity[i - 1] === 'L' ? L_CODES : G_CODES;
    left += table[digit(code[i]!)];
  }
  let right = '';
  for (let i = 7; i <= 12; i++) right += R_CODES[digit(code[i]!)];
  return START_END + left + CENTER + right + START_END;
}

function encodeEan8(code: string): string {
  let left = '';
  for (let i = 0; i < 4; i++) left += L_CODES[digit(code[i]!)];
  let right = '';
  for (let i = 4; i < 8; i++) right += R_CODES[digit(code[i]!)];
  return START_END + left + CENTER + right + START_END;
}

/**
 * Codifica un código de barras válido. UPC-A se dibuja como EAN-13 con un 0 adelante (mismas barras).
 * Devuelve null si el código es inválido o es GTIN-14 (usa otra simbología, ITF-14, no apta para góndola).
 */
export function encodeBarcode(raw: string): EncodedBarcode | null {
  const result = validateBarcode(raw);
  if (!result.ok) return null;
  switch (result.kind) {
    case 'EAN13':
    case 'UPCA': {
      const code = result.value.padStart(13, '0');
      return { kind: 'EAN13', text: result.value, modules: encodeEan13(code), quietZoneLeft: 11, quietZoneRight: 7 };
    }
    case 'EAN8':
      return { kind: 'EAN8', text: result.value, modules: encodeEan8(result.value), quietZoneLeft: 7, quietZoneRight: 7 };
    default:
      return null;
  }
}

export interface BarRun {
  /** Posición del inicio de la barra, en módulos desde el comienzo del símbolo. */
  start: number;
  width: number;
}

/** Agrupa módulos contiguos en barras (para dibujar un rectángulo por barra). */
export function modulesToBars(modules: string): BarRun[] {
  const bars: BarRun[] = [];
  let i = 0;
  while (i < modules.length) {
    if (modules[i] === '1') {
      const start = i;
      while (modules[i] === '1') i++;
      bars.push({ start, width: i - start });
    } else {
      i++;
    }
  }
  return bars;
}
