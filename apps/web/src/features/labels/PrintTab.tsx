import {
  type DashboardSummary,
  type LabelLayout,
  type LabelTemplateDto,
  type PrintJobCreated,
  type ProductDto,
  formatARS,
  layoutLabel,
  paginateLabels,
} from '@etiquetas/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, FileDown, Plus, Printer, Search, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, EmptyState, ErrorMessage, inputClass } from '../../components/ui';
import { api } from '../../lib/api';
import { formatInteger, plural } from '../../lib/format';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import { productsApi } from '../products/api';
import { LabelStatusBadge } from '../products/LabelStatusBadge';
import { labelKeys, labelsApi } from './api';
import { SheetSvg } from './LabelSvg';
import { printQueue, usePrintQueue } from './printQueue';

export function PrintTab({ templates }: { templates: LabelTemplateDto[] }) {
  const queryClient = useQueryClient();
  const queue = usePrintQueue();
  const ids = useMemo(() => queue.map((item) => item.productId), [queue]);

  const [templateId, setTemplateId] = useState<number | null>(null);
  const [startPosition, setStartPosition] = useState(1);
  const [markAsPrinted, setMarkAsPrinted] = useState(true);
  const [pageIndex, setPageIndex] = useState(0);
  const [lastJob, setLastJob] = useState<PrintJobCreated | null>(null);

  const template = templates.find((t) => t.id === templateId) ?? templates.find((t) => t.isDefault) ?? templates[0];

  const products = useQuery({
    queryKey: labelKeys.productsByIds(ids),
    queryFn: () => labelsApi.productsByIds(ids),
    enabled: ids.length > 0,
    placeholderData: keepPreviousData,
  });
  const settings = useQuery({ queryKey: labelKeys.settings, queryFn: labelsApi.settings });
  const productById = useMemo(() => new Map((products.data ?? []).map((p) => [p.id, p])), [products.data]);

  // Productos que ya no existen se quitan solos de la lista.
  useEffect(() => {
    if (!products.data || products.isPlaceholderData) return;
    const missing = ids.filter((id) => !productById.has(id));
    if (missing.length > 0) printQueue.remove(missing);
  }, [products.data, products.isPlaceholderData, ids, productById]);

  const inactive = queue.filter((item) => productById.get(item.productId)?.active === false);
  const totalLabels = queue.reduce((sum, item) => sum + item.quantity, 0);

  // Diseño de cada producto (una vez por producto) y reparto en hojas, igual que el PDF.
  const layouts = useMemo(() => {
    const map = new Map<number, LabelLayout>();
    if (!template) return map;
    for (const product of products.data ?? []) {
      map.set(product.id, layoutLabel(product, template, { pharmacyName: settings.data?.pharmacyName }));
    }
    return map;
  }, [products.data, template, settings.data?.pharmacyName]);

  const pages = useMemo(() => {
    if (!template || template.perPage === 0) return [];
    const labels = queue.flatMap((item) => {
      const layout = layouts.get(item.productId);
      return layout ? Array<LabelLayout>(item.quantity).fill(layout) : [];
    });
    return labels.length === 0 ? [] : paginateLabels(labels, template.perPage, startPosition);
  }, [queue, layouts, template, startPosition]);
  const page = Math.min(pageIndex, Math.max(pages.length - 1, 0));

  const warnings = useMemo(
    () =>
      queue.flatMap((item) => {
        const product = productById.get(item.productId);
        return (layouts.get(item.productId)?.warnings ?? []).map((w) => `${product?.name}: ${w}`);
      }),
    [queue, layouts, productById],
  );

  const generate = useMutation({
    mutationFn: () =>
      labelsApi.createPrintJob({ templateId: template!.id, items: queue, startPosition, markAsPrinted }),
    onSuccess: async (job) => {
      setLastJob(job);
      await Promise.all(
        [['products'], ['dashboard'], labelKeys.printJobs, labelKeys.templates].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
    },
  });

  function handleGenerate() {
    // La ventana se abre ya (en respuesta al clic) para que el navegador no la bloquee como emergente.
    const pdfWindow = window.open('about:blank', '_blank');
    generate.mutate(undefined, {
      onSuccess: (job) => {
        if (pdfWindow) pdfWindow.location.href = labelsApi.pdfUrl(job.id);
      },
      onError: () => pdfWindow?.close(),
    });
  }

  const canGenerate = !!template && template.perPage > 0 && queue.length > 0 && inactive.length === 0 && !generate.isPending;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <AddProducts />

        <Card title={`Lista para imprimir (${plural(queue.length, 'producto', 'productos')}, ${plural(totalLabels, 'etiqueta', 'etiquetas')})`}>
          {queue.length === 0 ? (
            <EmptyState>
              La lista está vacía. Buscá productos arriba, agregá los que cambiaron de precio o seleccionalos en el
              Catálogo.
            </EmptyState>
          ) : (
            <>
              {inactive.length > 0 && (
                <div className="mb-3 flex items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  <span>{plural(inactive.length, 'producto está inactivo', 'productos están inactivos')} y no se puede imprimir.</span>
                  <Button variant="secondary" onClick={() => printQueue.remove(inactive.map((i) => i.productId))}>
                    Quitarlos
                  </Button>
                </div>
              )}
              <div className="mb-2 flex flex-wrap items-center justify-end gap-2 text-sm">
                <span className="text-slate-500">Cantidad para todos:</span>
                {[1, 2, 3].map((n) => (
                  <Button key={n} variant="secondary" className="px-2 py-1" onClick={() => printQueue.setAllQuantities(n)}>
                    {n}
                  </Button>
                ))}
                <Button
                  variant="ghost"
                  onClick={() => window.confirm('¿Vaciar la lista de impresión?') && printQueue.clear()}
                >
                  <Trash2 className="size-4" /> Vaciar
                </Button>
              </div>
              <ul className="max-h-[28rem] divide-y divide-slate-100 overflow-y-auto">
                {queue.map((item) => (
                  <QueueRow key={item.productId} product={productById.get(item.productId)} quantity={item.quantity} productId={item.productId} />
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>

      <div className="space-y-4">
        <Card title="Impresión">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-700">Plantilla</span>
              <select
                className={inputClass}
                value={template?.id ?? ''}
                onChange={(e) => {
                  setTemplateId(Number(e.target.value));
                  setStartPosition(1);
                  setPageIndex(0);
                }}
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.widthMm} × {t.heightMm} mm, {t.perPage} por hoja)
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm" htmlFor="start-position">
              <span className="mb-1 block font-medium text-slate-700">Empezar en la posición</span>
              <input
                id="start-position"
                aria-describedby="start-position-hint"
                type="number"
                min={1}
                max={template?.perPage ?? 1}
                value={startPosition}
                onChange={(e) => setStartPosition(Math.min(Math.max(1, Number(e.target.value) || 1), template?.perPage ?? 1))}
                className={inputClass}
              />
              <span id="start-position-hint" className="mt-1 block text-xs text-slate-500">
                Para aprovechar una hoja autoadhesiva ya usada.
              </span>
            </label>
          </div>
          <label className="mt-4 flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-emerald-600"
              checked={markAsPrinted}
              onChange={(e) => setMarkAsPrinted(e.target.checked)}
            />
            <span>
              Marcar como impresas con el precio actual
              <span className="block text-xs text-slate-500">
                Desactivalo para una prueba: los productos seguirán figurando como pendientes.
              </span>
            </span>
          </label>

          {warnings.length > 0 && (
            <div className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <p className="mb-1 font-medium">Avisos de diseño ({warnings.length}):</p>
              <ul className="list-disc space-y-0.5 pl-4">
                {warnings.slice(0, 8).map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {generate.error && (
            <div className="mt-4">
              <ErrorMessage error={generate.error} />
            </div>
          )}

          {lastJob && (
            <div role="status" className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              <p className="font-medium">
                Listo: {plural(lastJob.labelCount, 'etiqueta', 'etiquetas')} en {plural(lastJob.pageCount, 'hoja', 'hojas')}.
              </p>
              <p className="mt-1 text-xs">
                Al imprimir elegí <strong>Tamaño real / 100 %</strong> (no "Ajustar a la página"). La regla de la primera
                hoja tiene que medir 100 mm.
              </p>
              <div className="mt-2 flex gap-2">
                <a
                  href={labelsApi.pdfUrl(lastJob.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                >
                  <FileDown className="size-3.5" /> Abrir PDF
                </a>
                <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => { printQueue.clear(); setLastJob(null); }}>
                  Vaciar la lista
                </Button>
              </div>
            </div>
          )}

          <Button className="mt-4 w-full" onClick={handleGenerate} disabled={!canGenerate}>
            <Printer className="size-4" />
            {generate.isPending
              ? 'Generando…'
              : `Generar PDF (${plural(totalLabels, 'etiqueta', 'etiquetas')}, ${plural(pages.length, 'hoja', 'hojas')})`}
          </Button>
        </Card>

        {template && pages.length > 0 && (
          <Card title="Vista previa">
            <div className="mb-3 flex items-center justify-between text-sm">
              <span className="text-slate-500">
                Hoja {page + 1} de {pages.length}
              </span>
              <div className="flex gap-1">
                <Button variant="secondary" className="px-2 py-1" disabled={page === 0} onClick={() => setPageIndex(page - 1)} aria-label="Hoja anterior">
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  variant="secondary"
                  className="px-2 py-1"
                  disabled={page >= pages.length - 1}
                  onClick={() => setPageIndex(page + 1)}
                  aria-label="Hoja siguiente"
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
            <div className="rounded-lg bg-slate-200 p-3">
              <SheetSvg template={template} slots={pages[page] ?? []} className="mx-auto w-full max-w-xl shadow" />
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function QueueRow({ product, productId, quantity }: { product: ProductDto | undefined; productId: number; quantity: number }) {
  return (
    <li className="flex items-center gap-3 py-2 text-sm">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{product?.name ?? 'Cargando…'}</p>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
          {product && <span className="tabular-nums">{formatARS(product.priceCents)}</span>}
          {product && <LabelStatusBadge status={product.labelStatus} />}
          {product && !product.active && <Badge tone="danger">Inactivo</Badge>}
        </div>
      </div>
      <input
        type="number"
        min={1}
        max={500}
        value={quantity}
        onChange={(e) => printQueue.setQuantity(productId, Math.min(500, Math.max(1, Math.trunc(Number(e.target.value)) || 1)))}
        className="w-16 rounded-md border border-slate-300 px-2 py-1 text-right text-sm tabular-nums"
        aria-label={`Cantidad de etiquetas de ${product?.name ?? 'producto'}`}
      />
      <button
        type="button"
        onClick={() => printQueue.remove([productId])}
        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600"
        aria-label={`Quitar ${product?.name ?? 'producto'}`}
      >
        <Trash2 className="size-4" />
      </button>
    </li>
  );
}

function AddProducts() {
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search.trim());
  const [notice, setNotice] = useState<string | null>(null);

  const results = useQuery({
    queryKey: ['products', 'list', { search: debounced, pageSize: 8, picker: true }],
    queryFn: () => productsApi.list({ search: debounced, pageSize: 8 }),
    enabled: debounced.length > 0,
  });
  const summary = useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: () => api.get<DashboardSummary>('/dashboard/summary'),
  });

  const addByStatus = useMutation({
    mutationFn: (labelStatus: 'outdated' | 'never') => productsApi.ids({ labelStatus }),
    onSuccess: ({ ids }) => setNotice(`Se agregaron ${plural(printQueue.add(ids), 'producto', 'productos')} a la lista.`),
  });

  return (
    <Card title="Agregar productos">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre o escanear el código de barras…"
          className={`${inputClass} pl-9`}
          aria-label="Buscar productos para agregar"
          onKeyDown={(e) => {
            // Con un lector de códigos: Enter agrega directamente si hay un único resultado.
            if (e.key === 'Enter' && results.data?.items.length === 1) {
              printQueue.add([results.data.items[0]!.id]);
              setSearch('');
            }
          }}
        />
      </div>
      {debounced && results.data && (
        <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
          {results.data.items.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">Sin resultados.</li>}
          {results.data.items.map((product) => (
            <li key={product.id}>
              <button
                type="button"
                onClick={() => printQueue.add([product.id])}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50"
              >
                <span className="min-w-0 truncate">
                  {product.name}
                  <span className="ml-2 text-xs text-slate-500">{product.presentation}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2 tabular-nums">
                  {formatARS(product.priceCents)}
                  <Plus className="size-4 text-emerald-600" />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={() => addByStatus.mutate('outdated')}
          disabled={addByStatus.isPending || !summary.data?.priceChangedSinceLastPrint}
        >
          Agregar con precio cambiado ({formatInteger(summary.data?.priceChangedSinceLastPrint ?? 0)})
        </Button>
        <Button
          variant="secondary"
          onClick={() => addByStatus.mutate('never')}
          disabled={addByStatus.isPending || !summary.data?.neverPrinted}
        >
          Agregar sin etiqueta ({formatInteger(summary.data?.neverPrinted ?? 0)})
        </Button>
      </div>
      {notice && <p className="mt-2 text-sm text-emerald-700">{notice}</p>}
      {addByStatus.error && (
        <div className="mt-2">
          <ErrorMessage error={addByStatus.error} />
        </div>
      )}
    </Card>
  );
}
