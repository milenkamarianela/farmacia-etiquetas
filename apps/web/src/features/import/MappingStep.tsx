import {
  type ColumnMapping,
  IMPORT_FIELDS,
  IMPORT_FIELD_LABELS,
  type ImportField,
  type ImportOptions,
  type ImportRow,
  columnLetter,
} from '@etiquetas/shared';
import { Badge } from '../../components/ui';

const PREVIEW_ROWS = 8;
const REQUIRED_HINTS: Partial<Record<ImportField, string>> = {
  price: 'Obligatorio',
  barcode: 'Este o el código interno',
  sku: 'Este o el código de barras',
  name: 'Necesario para crear productos nuevos',
};

export interface HeaderChoice {
  /** Filas candidatas a encabezado (las primeras del archivo). */
  candidates: ImportRow[];
  selected: number;
  onChange: (rowNumber: number) => void;
}

export function MappingStep(props: {
  headers: string[];
  rows: ImportRow[];
  mapping: ColumnMapping;
  onMappingChange: (mapping: ColumnMapping) => void;
  options: ImportOptions;
  onOptionsChange: (options: ImportOptions) => void;
  header: HeaderChoice;
  sheet: { names: string[]; selected: string | null; onChange: (name: string) => void; loading: boolean };
}) {
  const { headers, rows, mapping } = props;
  const fieldByColumn = new Map<number, ImportField>();
  for (const field of IMPORT_FIELDS) {
    const column = mapping[field];
    if (column !== null) fieldByColumn.set(column, field);
  }

  const selectClass = 'w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm';

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-1 text-sm font-semibold">¿Qué hay en cada columna?</h2>
        <p className="mb-4 text-sm text-slate-500">
          Ya propusimos las columnas según los encabezados. Revisalas y corregí lo que haga falta.
        </p>

        <div className="mb-5 flex flex-wrap gap-4">
          {props.sheet.names.length > 1 && (
            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-700">Hoja del Excel</span>
              <select
                className={selectClass}
                value={props.sheet.selected ?? ''}
                disabled={props.sheet.loading}
                onChange={(e) => props.sheet.onChange(e.target.value)}
              >
                {props.sheet.names.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">Fila de encabezados</span>
            <select
              className={selectClass}
              value={props.header.selected}
              onChange={(e) => props.header.onChange(Number(e.target.value))}
            >
              {props.header.candidates.map((row) => (
                <option key={row.rowNumber} value={row.rowNumber}>
                  Fila {row.rowNumber}: {row.cells.filter((c) => c !== null).slice(0, 3).join(' · ').slice(0, 60)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {IMPORT_FIELDS.map((field) => (
            <label key={field} className="text-sm">
              <span className="mb-1 block font-medium text-slate-700">
                {IMPORT_FIELD_LABELS[field]}
                {field === 'price' && <span className="text-red-500"> *</span>}
              </span>
              <select
                className={selectClass}
                value={mapping[field] ?? ''}
                onChange={(e) =>
                  props.onMappingChange({ ...mapping, [field]: e.target.value === '' ? null : Number(e.target.value) })
                }
              >
                <option value="">— No usar —</option>
                {headers.map((header, index) => (
                  <option key={index} value={index}>
                    {columnLetter(index)} · {header}
                  </option>
                ))}
              </select>
              {REQUIRED_HINTS[field] && <span className="mt-1 block text-xs text-slate-500">{REQUIRED_HINTS[field]}</span>}
            </label>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold">Opciones</h2>
        <div className="space-y-2 text-sm">
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-emerald-600"
              checked={props.options.createNew}
              onChange={(e) => props.onOptionsChange({ ...props.options, createNew: e.target.checked })}
            />
            <span>
              Crear los productos que no están en el catálogo
              <span className="block text-xs text-slate-500">
                Si lo desactivás, las filas de productos desconocidos se rechazan (útil para listas de un proveedor
                con más productos de los que vendés).
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-emerald-600"
              checked={props.options.updateDetails}
              onChange={(e) => props.onOptionsChange({ ...props.options, updateDetails: e.target.checked })}
            />
            <span>
              Reemplazar nombre, marca, presentación y categoría de los productos existentes
              <span className="block text-xs text-slate-500">
                Si está desactivado, solo se actualiza el precio y se completan los datos que estaban vacíos. Una celda
                vacía nunca borra información.
              </span>
            </span>
          </label>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-100 px-5 py-3 text-sm font-semibold">
          Primeras filas del archivo{' '}
          <span className="font-normal text-slate-500">({rows.length} filas en total)</span>
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs">
              <tr>
                <th className="px-3 py-2 font-medium text-slate-500">Fila</th>
                {headers.map((header, index) => {
                  const field = fieldByColumn.get(index);
                  return (
                    <th key={index} className={`px-3 py-2 align-top ${field ? 'bg-emerald-50' : ''}`}>
                      <p className="font-medium whitespace-nowrap text-slate-700">
                        {columnLetter(index)} · {header}
                      </p>
                      <div className="mt-1">
                        {field ? <Badge tone="success">{IMPORT_FIELD_LABELS[field]}</Badge> : <Badge>No se usa</Badge>}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.slice(0, PREVIEW_ROWS).map((row) => (
                <tr key={row.rowNumber}>
                  <td className="px-3 py-2 text-xs text-slate-400">{row.rowNumber}</td>
                  {headers.map((_, index) => (
                    <td
                      key={index}
                      className={`max-w-56 truncate px-3 py-2 ${fieldByColumn.has(index) ? '' : 'text-slate-400'}`}
                    >
                      {row.cells[index] ?? ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
