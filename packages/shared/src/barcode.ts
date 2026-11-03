/**
 * Validación de códigos de barras GTIN (EAN-8, UPC-A, EAN-13, GTIN-14).
 * Todos usan el mismo algoritmo de dígito verificador (módulo 10, pesos 3 y 1).
 */

export type BarcodeKind = 'EAN8' | 'UPCA' | 'EAN13' | 'GTIN14';

export type BarcodeResult =
  | { ok: true; value: string; kind: BarcodeKind }
  | { ok: false; error: string };

const KIND_BY_LENGTH: Record<number, BarcodeKind> = {
  8: 'EAN8',
  12: 'UPCA',
  13: 'EAN13',
  14: 'GTIN14',
};

/** Calcula el dígito verificador para los dígitos dados (sin incluir el verificador). */
export function gtinCheckDigit(digitsWithoutCheck: string): number {
  let sum = 0;
  // Desde la derecha, el primer dígito pesa 3, el siguiente 1, y así alternando.
  for (let i = digitsWithoutCheck.length - 1, weight = 3; i >= 0; i--, weight = 4 - weight) {
    sum += Number(digitsWithoutCheck[i]) * weight;
  }
  return (10 - (sum % 10)) % 10;
}

/** Normaliza y valida un código de barras recibido de un formulario o de Excel/CSV. */
export function validateBarcode(raw: unknown): BarcodeResult {
  let text: string;
  if (typeof raw === 'number') {
    if (!Number.isSafeInteger(raw) || raw < 0) {
      return { ok: false, error: 'El código de barras no es un número entero válido' };
    }
    text = String(raw);
  } else if (typeof raw === 'string') {
    text = raw.trim().replace(/[\s-]/g, '');
  } else {
    return { ok: false, error: 'Falta el código de barras' };
  }

  if (text === '') return { ok: false, error: 'Falta el código de barras' };
  if (/e\+?\d+$/i.test(text)) {
    return {
      ok: false,
      error: `"${text}" está en notación científica: formateá la columna del Excel como texto`,
    };
  }
  if (!/^\d+$/.test(text)) {
    return { ok: false, error: `"${text}" contiene caracteres que no son números` };
  }

  const kind = KIND_BY_LENGTH[text.length];
  if (!kind) {
    return { ok: false, error: `"${text}" tiene ${text.length} dígitos (se esperan 8, 12, 13 o 14)` };
  }

  const expected = gtinCheckDigit(text.slice(0, -1));
  if (Number(text.at(-1)) !== expected) {
    return { ok: false, error: `"${text}" tiene el dígito verificador incorrecto` };
  }
  return { ok: true, value: text, kind };
}
