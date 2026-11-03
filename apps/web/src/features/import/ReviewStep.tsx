import { type ImportAction, type ImportAnalysis, type ImportRowResult, formatARS } from '@etiquetas/shared';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Pagination } from '../../components/Pagination';
import { Badge, EmptyState } from '../../components/ui';
import { formatInteger, formatPercentChange } from '../../lib/format';

type Filter = 'all' | ImportAction | 'priceChanged' | 'warnings';

const ACTION_BADGES: Record<ImportAction, { text: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  create: { text: 'Nuevo', tone: 'success' },
  update: { text: 'Se actualiza', tone: 'warning' },
  unchanged: { text: 'Sin cambios', tone: 'neutral' },
  reject: { text: 'Rechazado', tone: 'danger' },
};

function matches(row: ImportRowResult, filter: Filter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'priceChanged':
      return row.priceChanged;
    case 'warnings':
      return row.action !== 'reject' && row.warnings.length > 0;
    default:
      return row.action === filter;
  }
}

export function ReviewStep({ analysis }: { analysis: ImportAnalysis }) {
  const { summary } = analysis;
  const [filter, setFilter] = useState<Filter>(summary.reject > 0 ? 'reject' : 'all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const filtered = useMemo(() => analysis.rows.filter((row) => matches(row, filter)), [analysis.rows, filter]);
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);

  const tabs: { id: Filter; label: string; count: number; tone?: string }[] = [
    { id: 'all', label: 'Todas', count: summary.totalRows },
    { id: 'create', label: 'Nuevos', count: summary.create },
    { id: 'priceChanged', label: 'Cambian de precio', count: summary.priceChanged },
    { id: 'update', label: 'Se actualizan', count: summary.update },
    { id: 'unchanged', label: 'Sin cambios', count: summary.unchanged },
    { id: 'reject', label: 'Rechazados', count: summary.reject, tone: 'text-red-700' },
    { id: 'warnings', label: 'Con advertencias', count: summary.withWarnings, tone: 'text-amber-700' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <SummaryTile label="Productos nuevos" value={summary.create} tone="text-emerald-700" />
        <SummaryTile label="Cambian de precio" value={summary.priceChanged} tone="text-amber-700" />
        <SummaryTile label="Otros datos completados" value={summary.update - summary.priceChanged} />
        <SummaryTile label="Sin cambios" value={summary.unchanged} />
        <SummaryTile label="Rechazados" value={summary.reject} tone={summary.reject > 0 ? 'text-red-700' : undefined} />
      </div>

      {summary.withWarnings > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>
            {summary.withWarnings === 1 ? 'Hay 1 fila' : `Hay ${formatInteger(summary.withWarnings)} filas`} con
            advertencias (por ejemplo, variaciones de precio muy grandes). Se importan igual: revisalas antes de
            confirmar.
          </p>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap gap-1 border-b border-slate-100 p-2" role="tablist">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={filter === tab.id}
              onClick={() => {
                setFilter(tab.id);
                setPage(1);
              }}
              className={`rounded-md px-3 py-1.5 text-sm ${
                filter === tab.id ? 'bg-slate-900 text-white' : `hover:bg-slate-100 ${tab.tone ?? 'text-slate-600'}`
              }`}
            >
              {tab.label} <span className="tabular-nums opacity-70">({formatInteger(tab.count)})</span>
            </button>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-600 uppercase">
              <tr>
                <th className="px-3 py-2 font-medium">Fila</th>
                <th className="px-3 py-2 font-medium">Producto</th>
                <th className="px-3 py-2 text-right font-medium">Precio</th>
                <th className="px-3 py-2 font-medium">Resultado</th>
                <th className="px-3 py-2 font-medium">Observaciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((row) => (
                <ResultRow key={row.rowNumber} row={row} />
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && <EmptyState>No hay filas en esta categoría.</EmptyState>}
        {filtered.length > 0 && (
          <Pagination
            page={page}
            pageSize={pageSize}
            total={filtered.length}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        )}
      </div>
    </div>
  );
}

function SummaryTile({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone ?? ''}`}>{formatInteger(value)}</p>
    </div>
  );
}

function ResultRow({ row }: { row: ImportRowResult }) {
  const badge = ACTION_BADGES[row.action];
  const percent =
    row.priceChanged && row.oldPriceCents !== null && row.newPriceCents !== null
      ? formatPercentChange(row.oldPriceCents, row.newPriceCents)
      : null;

  return (
    <tr className={row.action === 'reject' ? 'bg-red-50/40' : undefined}>
      <td className="px-3 py-2 text-xs text-slate-500 tabular-nums">{row.rowNumber}</td>
      <td className="px-3 py-2">
        <p className="font-medium">{row.name ?? <span className="text-slate-400">(sin nombre)</span>}</p>
        <p className="font-mono text-xs text-slate-500">{[row.barcode, row.sku].filter(Boolean).join(' · ')}</p>
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
        {row.priceChanged && row.oldPriceCents !== null ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="text-slate-400 line-through">{formatARS(row.oldPriceCents)}</span>
            <ArrowRight className="size-3 text-slate-400" />
            <span className="font-semibold">{row.newPriceCents !== null && formatARS(row.newPriceCents)}</span>
            {percent && <span className="text-xs text-slate-500">{percent}</span>}
          </span>
        ) : (
          row.newPriceCents !== null && formatARS(row.newPriceCents)
        )}
      </td>
      <td className="px-3 py-2">
        <Badge tone={badge.tone}>{badge.text}</Badge>
        {row.changedFields.length > 0 && (
          <p className="mt-1 text-xs text-slate-500">Actualiza: {row.changedFields.join(', ')}</p>
        )}
      </td>
      <td className="px-3 py-2 text-xs">
        {row.errors.map((error) => (
          <p key={error} className="text-red-700">
            {error}
          </p>
        ))}
        {row.warnings.map((warning) => (
          <p key={warning} className="text-amber-700">
            {warning}
          </p>
        ))}
      </td>
    </tr>
  );
}
