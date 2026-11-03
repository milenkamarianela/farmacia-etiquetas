import { type DashboardSummary, formatARS } from '@etiquetas/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  DatabaseBackup,
  FileDown,
  FileSpreadsheet,
  Package,
  PackageX,
  Printer,
  TagIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button, Card, EmptyState, ErrorMessage, PageHeader, StatCard } from '../components/ui';
import { historyApi } from '../features/history/api';
import { SOURCE_LABELS } from '../features/history/PriceChangesTab';
import { labelsApi } from '../features/labels/api';
import { printQueue } from '../features/labels/printQueue';
import { productsApi } from '../features/products/api';
import { api } from '../lib/api';
import { formatDateTime, formatInteger, formatPercentChange, formatRelative, plural } from '../lib/format';

/** Si la última copia es más vieja que esto, se avisa en el panel. */
const BACKUP_WARNING_HOURS = 48;

export function DashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, error, isPending } = useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: () => api.get<DashboardSummary>('/dashboard/summary'),
  });

  const queueOutdated = useMutation({
    mutationFn: () => productsApi.ids({ labelStatus: 'outdated' }),
    onSuccess: ({ ids }) => {
      printQueue.add(ids);
      navigate('/etiquetas');
    },
  });
  const backupNow = useMutation({
    mutationFn: historyApi.createBackup,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
  });

  const value = (n: number | undefined) => (isPending ? '…' : formatInteger(n ?? 0));
  const backupAgeHours = data?.backup.lastBackupAt
    ? (Date.now() - new Date(data.backup.lastBackupAt).getTime()) / 3_600_000
    : Number.POSITIVE_INFINITY;

  return (
    <>
      <PageHeader title="Inicio" description="Estado general del catálogo y de las etiquetas." />

      {error && (
        <div className="mb-4">
          <ErrorMessage error={error} />
        </div>
      )}

      {!!data?.priceChangedSinceLastPrint && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
          <AlertTriangle className="size-5 text-amber-600" />
          <p className="flex-1 text-sm text-amber-900">
            <strong>{plural(data.priceChangedSinceLastPrint, 'etiqueta tiene', 'etiquetas tienen')} un precio viejo</strong> en
            la góndola.
          </p>
          <Button onClick={() => queueOutdated.mutate()} disabled={queueOutdated.isPending}>
            <Printer className="size-4" /> Imprimirlas ahora
          </Button>
        </div>
      )}
      {queueOutdated.error && <ErrorMessage error={queueOutdated.error} />}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Link to="/productos" className="rounded-xl transition-shadow hover:shadow-md">
          <StatCard label="Productos activos" value={value(data?.activeProducts)} icon={Package} tone="success" />
        </Link>
        <Link to="/productos?etiqueta=outdated" className="rounded-xl transition-shadow hover:shadow-md">
          <StatCard
            label="Precio cambiado"
            value={value(data?.priceChangedSinceLastPrint)}
            icon={AlertTriangle}
            tone="warning"
            hint="Etiqueta impresa con un precio viejo"
          />
        </Link>
        <Link to="/productos?etiqueta=never" className="rounded-xl transition-shadow hover:shadow-md">
          <StatCard label="Sin etiqueta" value={value(data?.neverPrinted)} icon={TagIcon} hint="Nunca se les imprimió etiqueta" />
        </Link>
        <Link to="/productos?estado=inactive" className="rounded-xl transition-shadow hover:shadow-md">
          <StatCard label="Inactivos" value={value(data?.inactiveProducts)} icon={PackageX} />
        </Link>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Últimos cambios de precio">
          {data?.recentPriceChanges.length === 0 && <EmptyState>Todavía no hubo cambios de precio.</EmptyState>}
          <ul className="divide-y divide-slate-100">
            {data?.recentPriceChanges.map((change) => (
              <li key={change.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{change.productName}</p>
                  <p className="text-xs text-slate-500">
                    {formatDateTime(change.changedAt)} · {SOURCE_LABELS[change.source]}
                  </p>
                </div>
                <p className="shrink-0 text-right tabular-nums">
                  <span className="font-semibold">{formatARS(change.newPriceCents)}</span>
                  {change.oldPriceCents !== null && (
                    <span className="block text-xs text-slate-500">
                      antes {formatARS(change.oldPriceCents)} ({formatPercentChange(change.oldPriceCents, change.newPriceCents)})
                    </span>
                  )}
                </p>
              </li>
            ))}
          </ul>
          <MoreLink to="/historial">Ver todo el historial</MoreLink>
        </Card>

        <div className="space-y-6">
          <Card title="Copia de seguridad">
            <div className="flex flex-wrap items-center gap-4">
              <DatabaseBackup className={`size-8 ${backupAgeHours > BACKUP_WARNING_HOURS ? 'text-red-500' : 'text-emerald-600'}`} />
              <div className="flex-1 text-sm">
                {data?.backup.lastBackupAt ? (
                  <p>
                    Última copia: <strong>{formatRelative(data.backup.lastBackupAt)}</strong> ({formatDateTime(data.backup.lastBackupAt)})
                  </p>
                ) : (
                  <p className="font-medium text-red-700">{isPending ? '…' : 'Todavía no hay ninguna copia.'}</p>
                )}
                {backupAgeHours > BACKUP_WARNING_HOURS && data?.backup.lastBackupAt && (
                  <p className="text-xs text-red-700">Hace más de 2 días que no se hace una copia.</p>
                )}
                {data && (
                  <p className="text-xs break-all text-slate-500">
                    {plural(data.backup.count, 'copia guardada', 'copias guardadas')} en {data.backup.directory}
                  </p>
                )}
              </div>
              <Button variant="secondary" onClick={() => backupNow.mutate()} disabled={backupNow.isPending}>
                {backupNow.isPending ? 'Copiando…' : 'Hacer copia ahora'}
              </Button>
            </div>
            {backupNow.error && <ErrorMessage error={backupNow.error} />}
          </Card>

          <Card title="Accesos rápidos">
            <div className="grid gap-2 sm:grid-cols-2">
              <QuickLink to="/importar" icon={<FileSpreadsheet className="size-4" />}>
                Importar lista de precios
              </QuickLink>
              <QuickLink to="/etiquetas" icon={<Printer className="size-4" />}>
                Imprimir etiquetas
              </QuickLink>
            </div>
          </Card>
        </div>

        <Card title="Últimas importaciones">
          {data?.recentImports.length === 0 && <EmptyState>Todavía no se importó ningún archivo.</EmptyState>}
          <ul className="divide-y divide-slate-100">
            {data?.recentImports.map((batch) => (
              <li key={batch.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{batch.fileName}</p>
                  <p className="text-xs text-slate-500">{formatDateTime(batch.createdAt)}</p>
                </div>
                <Link to={`/historial?importacion=${batch.id}`} className="shrink-0 text-right text-xs text-slate-500 hover:text-emerald-700">
                  {plural(batch.createdCount, 'nuevo', 'nuevos')} ·{' '}
                  {plural(batch.priceChangeCount, 'precio cambiado', 'precios cambiados')}
                  {batch.rejectedCount > 0 && ` · ${plural(batch.rejectedCount, 'rechazado', 'rechazados')}`}
                </Link>
              </li>
            ))}
          </ul>
          <MoreLink to="/historial?vista=importaciones">Ver todas</MoreLink>
        </Card>

        <Card title="Últimas impresiones">
          {data?.recentPrintJobs.length === 0 && <EmptyState>Todavía no se imprimieron etiquetas.</EmptyState>}
          <ul className="divide-y divide-slate-100">
            {data?.recentPrintJobs.map((job) => (
              <li key={job.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{job.templateName}</p>
                  <p className="text-xs text-slate-500">
                    {formatDateTime(job.createdAt)} · {plural(job.labelCount, 'etiqueta', 'etiquetas')} ·{' '}
                    {plural(job.productCount, 'producto', 'productos')}
                  </p>
                </div>
                <a
                  href={labelsApi.pdfUrl(job.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-emerald-700 hover:underline"
                >
                  <FileDown className="size-3.5" /> PDF
                </a>
              </li>
            ))}
          </ul>
          <MoreLink to="/historial?vista=impresiones">Ver todas</MoreLink>
        </Card>
      </div>
    </>
  );
}

function MoreLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline">
      {children} <ArrowRight className="size-3" />
    </Link>
  );
}

function QuickLink({ to, icon, children }: { to: string; icon: ReactNode; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-700 hover:border-emerald-300 hover:bg-emerald-50"
    >
      {icon}
      {children}
    </Link>
  );
}
