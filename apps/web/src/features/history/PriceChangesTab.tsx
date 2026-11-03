import { type PriceChangeListItem, type PriceChangeQuery, type PriceChangeSource, formatARS } from '@etiquetas/shared';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { ArrowRight, Download, Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Pagination } from '../../components/Pagination';
import { Badge, Button, EmptyState, ErrorMessage, inputClass } from '../../components/ui';
import { formatDateTime, formatPercentChange } from '../../lib/format';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import { downloadText } from '../import/rejectedCsv';
import { historyApi, historyKeys } from './api';

export const SOURCE_LABELS: Record<PriceChangeSource, string> = {
  CREATE: 'Alta',
  MANUAL: 'Edición manual',
  IMPORT: 'Importación',
};

type SourceFilter = NonNullable<PriceChangeQuery['source']>;
const EXPORT_PAGE_SIZE = 200;
const EXPORT_MAX_PAGES = 25;

function csvField(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[";\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** CSV para Excel en español: ";" como separador, coma decimal y BOM. */
export function buildPriceChangesCsv(rows: PriceChangeListItem[]): string {
  const money = (cents: number | null) => (cents === null ? '' : (cents / 100).toFixed(2).replace('.', ','));
  const lines = [
    ['Fecha', 'Producto', 'Código de barras', 'Código interno', 'Precio anterior', 'Precio nuevo', 'Origen', 'Archivo'].join(';'),
    ...rows.map((r) =>
      [
        formatDateTime(r.changedAt),
        r.productName,
        r.productBarcode,
        r.productSku,
        money(r.oldPriceCents),
        money(r.newPriceCents),
        SOURCE_LABELS[r.source],
        r.importFileName,
      ]
        .map(csvField)
        .join(';'),
    ),
  ];
  return `﻿${lines.join('\r\n')}\r\n`;
}

export function PriceChangesTab(props: { importBatchId?: number; importFileName?: string; onClearImport: () => void }) {
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput.trim());
  const [source, setSource] = useState<SourceFilter>(props.importBatchId ? 'all' : 'changes');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  useEffect(() => setPage(1), [search, source, from, to, pageSize, props.importBatchId]);

  const filters: PriceChangeQuery = { search: search || undefined, source, from, to, importBatchId: props.importBatchId };
  const query: PriceChangeQuery = { ...filters, page, pageSize };
  const changes = useQuery({
    queryKey: historyKeys.priceChanges(query),
    queryFn: () => historyApi.priceChanges(query),
    placeholderData: keepPreviousData,
  });

  const exportCsv = useMutation({
    mutationFn: async () => {
      const rows: PriceChangeListItem[] = [];
      for (let p = 1; p <= EXPORT_MAX_PAGES; p++) {
        const result = await historyApi.priceChanges({ ...filters, page: p, pageSize: EXPORT_PAGE_SIZE });
        rows.push(...result.items);
        if (rows.length >= result.total) break;
      }
      return rows;
    },
    onSuccess: (rows) => downloadText(buildPriceChangesCsv(rows), `historial-precios-${new Date().toISOString().slice(0, 10)}.csv`),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative min-w-64 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Buscar producto…"
            className={`${inputClass} pl-9`}
            aria-label="Buscar producto"
          />
        </div>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-slate-500">Origen</span>
          <select className={inputClass} value={source} onChange={(e) => setSource(e.target.value as SourceFilter)}>
            <option value="changes">Cambios de precio</option>
            <option value="IMPORT">Solo importaciones</option>
            <option value="MANUAL">Solo ediciones manuales</option>
            <option value="CREATE">Altas de productos</option>
            <option value="all">Todo</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-slate-500">Desde</span>
          <input type="date" className={inputClass} value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-slate-500">Hasta</span>
          <input type="date" className={inputClass} value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        </label>
        <Button variant="secondary" onClick={() => exportCsv.mutate()} disabled={exportCsv.isPending || !changes.data?.total}>
          <Download className="size-4" /> {exportCsv.isPending ? 'Exportando…' : 'Exportar CSV'}
        </Button>
      </div>

      {props.importBatchId && (
        <p className="flex items-center gap-2 text-sm">
          <Badge tone="warning">Importación: {props.importFileName ?? `#${props.importBatchId}`}</Badge>
          <button type="button" onClick={props.onClearImport} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800">
            <X className="size-3.5" /> Quitar filtro
          </button>
        </p>
      )}
      {(changes.error ?? exportCsv.error) && <ErrorMessage error={changes.error ?? exportCsv.error} />}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-600 uppercase">
              <tr>
                <th className="px-3 py-2 font-medium">Fecha</th>
                <th className="px-3 py-2 font-medium">Producto</th>
                <th className="px-3 py-2 text-right font-medium">Precio</th>
                <th className="px-3 py-2 text-right font-medium">Variación</th>
                <th className="px-3 py-2 font-medium">Origen</th>
              </tr>
            </thead>
            <tbody className={`divide-y divide-slate-100 ${changes.isPlaceholderData ? 'opacity-60' : ''}`}>
              {changes.data?.items.map((change) => (
                <tr key={change.id}>
                  <td className="px-3 py-2 text-xs whitespace-nowrap text-slate-500">{formatDateTime(change.changedAt)}</td>
                  <td className="px-3 py-2">
                    <p className="font-medium">{change.productName}</p>
                    <p className="font-mono text-xs text-slate-500">
                      {[change.productBarcode, change.productSku].filter(Boolean).join(' · ')}
                    </p>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                    {change.oldPriceCents !== null && (
                      <span className="inline-flex items-center gap-1.5 text-slate-400">
                        {formatARS(change.oldPriceCents)} <ArrowRight className="size-3" />
                      </span>
                    )}{' '}
                    <span className="font-semibold">{formatARS(change.newPriceCents)}</span>
                  </td>
                  <td className="px-3 py-2 text-right text-xs whitespace-nowrap tabular-nums">
                    {change.oldPriceCents !== null && <Variation oldCents={change.oldPriceCents} newCents={change.newPriceCents} />}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <p>{SOURCE_LABELS[change.source]}</p>
                    {change.importFileName && <p className="text-slate-500">{change.importFileName}</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {changes.isPending && <EmptyState>Cargando…</EmptyState>}
        {changes.data?.total === 0 && <EmptyState>No hay cambios de precio con esos filtros.</EmptyState>}
        {!!changes.data?.total && (
          <Pagination page={page} pageSize={pageSize} total={changes.data.total} onPageChange={setPage} onPageSizeChange={setPageSize} />
        )}
      </div>
    </div>
  );
}

function Variation({ oldCents, newCents }: { oldCents: number; newCents: number }) {
  const text = formatPercentChange(oldCents, newCents);
  if (!text) return null;
  return <span className={newCents > oldCents ? 'text-red-700' : 'text-emerald-700'}>{text}</span>;
}
