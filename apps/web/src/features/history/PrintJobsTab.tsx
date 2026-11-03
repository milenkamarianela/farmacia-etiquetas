import { formatARS } from '@etiquetas/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, FileDown, ListPlus } from 'lucide-react';
import { Fragment, useState } from 'react';
import { useNavigate } from 'react-router';
import { Pagination } from '../../components/Pagination';
import { Badge, Button, EmptyState, ErrorMessage } from '../../components/ui';
import { formatDateTime, plural } from '../../lib/format';
import { labelsApi } from '../labels/api';
import { printQueue } from '../labels/printQueue';
import { historyApi, historyKeys } from './api';

export function PrintJobsTab() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [expanded, setExpanded] = useState<number | null>(null);
  const jobs = useQuery({
    queryKey: historyKeys.printJobs({ page, pageSize }),
    queryFn: () => historyApi.printJobs({ page, pageSize }),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      {jobs.error && <ErrorMessage error={jobs.error} />}
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-600 uppercase">
          <tr>
            <th className="w-8" />
            <th className="px-3 py-2 font-medium">Fecha</th>
            <th className="px-3 py-2 font-medium">Plantilla</th>
            <th className="px-3 py-2 text-right font-medium">Etiquetas</th>
            <th className="px-3 py-2 text-right font-medium">Productos</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {jobs.data?.items.map((job) => (
            <Fragment key={job.id}>
              <tr className="cursor-pointer hover:bg-slate-50" onClick={() => setExpanded(expanded === job.id ? null : job.id)}>
                <td className="pl-3 text-slate-400">
                  {expanded === job.id ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(job.createdAt)}</td>
                <td className="px-3 py-2">{job.templateName}</td>
                <td className="px-3 py-2 text-right tabular-nums">{job.labelCount}</td>
                <td className="px-3 py-2 text-right tabular-nums">{job.productCount}</td>
                <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                  <a
                    href={labelsApi.pdfUrl(job.id)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline"
                  >
                    <FileDown className="size-3.5" /> PDF
                  </a>
                </td>
              </tr>
              {expanded === job.id && (
                <tr>
                  <td colSpan={6} className="bg-slate-50 px-6 py-3">
                    <PrintJobDetailView id={job.id} />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
      {jobs.isPending && <EmptyState>Cargando…</EmptyState>}
      {jobs.data?.total === 0 && <EmptyState>Todavía no se imprimieron etiquetas.</EmptyState>}
      {!!jobs.data?.total && (
        <Pagination page={page} pageSize={pageSize} total={jobs.data.total} onPageChange={setPage} onPageSizeChange={setPageSize} />
      )}
    </div>
  );
}

function PrintJobDetailView({ id }: { id: number }) {
  const navigate = useNavigate();
  const detail = useQuery({ queryKey: historyKeys.printJob(id), queryFn: () => historyApi.printJob(id) });
  if (detail.error) return <ErrorMessage error={detail.error} />;
  if (!detail.data) return <p className="text-sm text-slate-500">Cargando…</p>;
  const job = detail.data;
  const outdated = job.items.filter((item) => item.currentPriceCents !== item.priceCents).length;

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          {job.widthMm} × {job.heightMm} mm · empezó en la posición {job.startPosition}
          {outdated > 0 && ` · ${plural(outdated, 'producto cambió', 'productos cambiaron')} de precio desde entonces`}
        </p>
        <Button
          variant="secondary"
          onClick={() => {
            printQueue.add(job.items.map((item) => item.productId));
            for (const item of job.items) printQueue.setQuantity(item.productId, item.quantity);
            navigate('/etiquetas');
          }}
        >
          <ListPlus className="size-4" /> Volver a la lista de impresión
        </Button>
      </div>
      <ul className="divide-y divide-slate-200">
        {job.items.map((item) => (
          <li key={item.productId} className="flex items-center justify-between gap-3 py-1.5">
            <span>
              {item.quantity} × {item.name}
            </span>
            <span className="flex items-center gap-2 tabular-nums">
              {formatARS(item.priceCents)}
              {item.currentPriceCents !== item.priceCents && (
                <Badge tone="warning">Hoy: {formatARS(item.currentPriceCents)}</Badge>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
