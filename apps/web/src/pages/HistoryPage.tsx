import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { EmptyState, ErrorMessage, PageHeader } from '../components/ui';
import { PriceChangesTab } from '../features/history/PriceChangesTab';
import { PrintJobsTab } from '../features/history/PrintJobsTab';
import { importApi, importKeys } from '../features/import/api';
import { formatDateTime } from '../lib/format';

const TABS = [
  { id: 'precios', label: 'Cambios de precio' },
  { id: 'impresiones', label: 'Impresiones' },
  { id: 'importaciones', label: 'Importaciones' },
] as const;
type TabId = (typeof TABS)[number]['id'];

export function HistoryPage() {
  const [params, setParams] = useSearchParams();
  const tab: TabId = TABS.find((t) => t.id === params.get('vista'))?.id ?? 'precios';
  const importBatchId = Number(params.get('importacion')) || undefined;
  const batches = useQuery({ queryKey: importKeys.batches, queryFn: importApi.batches });
  const importFileName = batches.data?.find((b) => b.id === importBatchId)?.fileName;

  return (
    <>
      <PageHeader title="Historial" description="Qué precios cambiaron, cuándo y de dónde vino cada cambio." />
      <div role="tablist" className="mb-6 flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setParams(t.id === 'precios' ? {} : { vista: t.id }, { replace: true })}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              tab === t.id ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'precios' && (
        <PriceChangesTab
          key={importBatchId ?? 'all'}
          importBatchId={importBatchId}
          importFileName={importFileName}
          onClearImport={() => setParams({}, { replace: true })}
        />
      )}
      {tab === 'impresiones' && <PrintJobsTab />}
      {tab === 'importaciones' && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {batches.error && <ErrorMessage error={batches.error} />}
          {batches.data?.length === 0 && <EmptyState>Todavía no se importó ningún archivo.</EmptyState>}
          <ul className="divide-y divide-slate-100">
            {batches.data?.map((batch) => (
              <li key={batch.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium">{batch.fileName}</p>
                  <p className="text-xs text-slate-500">
                    {formatDateTime(batch.createdAt)} · {batch.createdCount} nuevos · {batch.updatedCount} actualizados ·{' '}
                    {batch.unchangedCount} sin cambios · {batch.rejectedCount} rechazados
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setParams({ importacion: String(batch.id) })}
                  className="text-xs font-medium text-emerald-700 hover:underline"
                  disabled={batch.priceChangeCount === 0 && batch.createdCount === 0}
                >
                  Ver {batch.priceChangeCount} cambios de precio
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
