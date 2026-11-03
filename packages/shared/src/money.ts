/**
 * Los importes se manejan siempre como centavos enteros (number seguro o bigint en la base).
 * Nunca se opera con pesos en punto flotante.
 */

/** Tope de precio aceptado: $ 999.999.999,99. Muy por encima de cualquier producto real. */
export const MAX_PRICE_CENTS = 99_999_999_999;

export type PriceParseResult =
  | { ok: true; cents: number }
  | { ok: false; error: string };

const fail = (error: string): PriceParseResult => ({ ok: false, error });

function checkRange(cents: number): PriceParseResult {
  if (!Number.isSafeInteger(cents)) return fail('El precio no es un número válido');
  if (cents < 0) return fail('El precio no puede ser negativo');
  if (cents > MAX_PRICE_CENTS) return fail('El precio supera el máximo permitido');
  return { ok: true, cents };
}

function countChar(text: string, char: string): number {
  return text.split(char).length - 1;
}

/**
 * Convierte un precio escrito por una persona o leído de Excel/CSV a centavos.
 *
 * Acepta formato argentino ("12.450,50", "$ 12.450"), formato con punto decimal
 * ("12450.50") y números nativos de Excel (12450.5).
 * Reglas para casos ambiguos:
 *  - Si hay punto y coma, el último que aparece es el separador decimal.
 *  - Una sola coma es separador decimal ("12,5" = 12,50).
 *  - Un solo punto seguido de exactamente 3 dígitos es separador de miles ("12.450" = 12.450,00).
 *  - Más de 2 decimales se rechaza: suele indicar una columna mal interpretada.
 */
export function parsePriceToCents(input: unknown): PriceParseResult {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return fail('El precio no es un número válido');
    if (input < 0) return fail('El precio no puede ser negativo');
    // Los números de Excel pueden venir de fórmulas con más decimales: se redondea al centavo.
    return checkRange(Math.round(input * 100));
  }
  if (typeof input !== 'string') return fail('Falta el precio');

  const original = input.trim();
  const text = original
    .replace(/^ARS/i, '')
    .replace(/^\$/, '')
    .replace(/\s/g, '');

  if (text === '') return fail('Falta el precio');
  if (text.startsWith('-')) return fail('El precio no puede ser negativo');
  if (!/^[\d.,]+$/.test(text)) return fail(`"${original}" no es un precio válido`);

  const dots = countChar(text, '.');
  const commas = countChar(text, ',');

  let decimalSep: '.' | ',' | null = null;
  if (dots > 0 && commas > 0) {
    decimalSep = text.lastIndexOf('.') > text.lastIndexOf(',') ? '.' : ',';
  } else if (commas === 1) {
    decimalSep = ',';
  } else if (dots === 1 && !/\.\d{3}$/.test(text)) {
    decimalSep = '.';
  }

  let intPart = text;
  let decPart = '';
  if (decimalSep) {
    const index = text.lastIndexOf(decimalSep);
    intPart = text.slice(0, index);
    decPart = text.slice(index + 1);
    if (intPart.includes(decimalSep)) return fail(`"${original}" no es un precio válido`);
    if (decPart === '') return fail(`"${original}" no es un precio válido`);
    if (decPart.length > 2) return fail(`"${original}" tiene más de 2 decimales`);
  }

  if (intPart === '') intPart = '0';
  if (/[.,]/.test(intPart)) {
    // Con separador de miles los grupos deben ser de 3 dígitos y el primero no empieza con 0.
    // (No pueden mezclarse: si hubiera punto y coma, uno de los dos ya es el decimal).
    if (!/^[1-9]\d{0,2}([.,]\d{3})+$/.test(intPart)) {
      return fail(`"${original}" no es un precio válido`);
    }
  }

  const intDigits = intPart.replace(/[.,]/g, '');
  if (intDigits.length > 13) return fail('El precio supera el máximo permitido');

  const cents = Number(intDigits) * 100 + Number(decPart.padEnd(2, '0'));
  return checkRange(cents);
}

/** Formatea centavos como pesos argentinos: 1245000 → "$ 12.450,00". */
export function formatARS(cents: number | bigint): string {
  const value = typeof cents === 'bigint' ? cents : BigInt(Math.trunc(cents));
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const integer = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const decimals = (abs % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}$ ${integer},${decimals}`;
}

/** Centavos → texto editable sin símbolo: 1245000 → "12450,00". Útil para formularios. */
export function centsToInputValue(cents: number): string {
  const integer = Math.trunc(cents / 100);
  const decimals = String(Math.abs(cents % 100)).padStart(2, '0');
  return `${integer},${decimals}`;
}
