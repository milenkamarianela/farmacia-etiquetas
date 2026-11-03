const dateTimeFormat = new Intl.DateTimeFormat('es-AR', {
  dateStyle: 'short',
  timeStyle: 'short',
});

const integerFormat = new Intl.NumberFormat('es-AR');

export const formatDateTime = (iso: string) => dateTimeFormat.format(new Date(iso));
export const formatInteger = (value: number) => integerFormat.format(value);

const relativeFormat = new Intl.RelativeTimeFormat('es-AR', { numeric: 'auto' });

/** "hace 5 minutos", "ayer", "hace 3 días". */
export function formatRelative(iso: string, now = Date.now()): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return relativeFormat.format(Math.round(seconds / size), unit);
  }
  return 'recién';
}

/** Cantidad con la palabra en singular o plural: plural(1, 'producto nuevo', 'productos nuevos'). */
export const plural = (count: number, singular: string, pluralForm: string) =>
  `${formatInteger(count)} ${count === 1 ? singular : pluralForm}`;

/** Variación porcentual entre dos precios: "+9,1 %". Null si el precio anterior es cero. */
export function formatPercentChange(oldCents: number, newCents: number): string | null {
  if (oldCents === 0) return null;
  const percent = ((newCents - oldCents) / oldCents) * 100;
  const sign = percent > 0 ? '+' : '';
  return `${sign}${percent.toLocaleString('es-AR', { maximumFractionDigits: 1 })} %`;
}
