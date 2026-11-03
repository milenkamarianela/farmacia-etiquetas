import { type ProductDto, type ProductListQuery, formatARS } from '@etiquetas/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Plus, Printer, Search } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { printQueue } from '../features/labels/printQueue';
import { Pagination } from '../components/Pagination';
import { Badge, Button, EmptyState, ErrorMessage, PageHeader, inputClass } from '../components/ui';
import { productKeys, productsApi } from '../features/products/api';
import { LabelStatusBadge } from '../features/products/LabelStatusBadge';
import { ProductFormDialog } from '../features/products/ProductFormDialog';
import { formatDateTime, formatInteger } from '../lib/format';
import { useDebouncedValue } from '../lib/useDebouncedValue';

type SortField = NonNullable<ProductListQuery['sort']>;
type Filters = Required<Pick<ProductListQuery, 'status' | 'labelStatus'>> & { categoryId: number | undefined };

const selectClass = 'rounded-md border border-slate-300 bg-white px-3 py-2 text-sm';
/** Valores aceptados en /productos?etiqueta=… (enlaces desde otras pantallas). */
const LABEL_STATUS_PARAMS = ['outdated', 'never', 'current'] as const;
const STATUS_PARAMS = ['active', 'inactive', 'all'] as const;

export function ProductsPage() {
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput.trim());
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [filters, setFilters] = useState<Filters>(() => ({
    status: STATUS_PARAMS.find((value) => value === searchParams.get('estado')) ?? 'active',
    labelStatus: LABEL_STATUS_PARAMS.find((value) => value === searchParams.get('etiqueta')) ?? 'all',
    categoryId: undefined,
  }));
  const [sort, setSort] = useState<{ field: SortField; order: 'asc' | 'desc' }>({ field: 'name', order: 'asc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<ProductDto | 'new' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Cualquier cambio de búsqueda o filtros vuelve a la primera página.
  useEffect(() => setPage(1), [search, filters, pageSize]);

  const filterQuery: ProductListQuery = { search: search || undefined, ...filters };
  const query: ProductListQuery = { ...filterQuery, sort: sort.field, order: sort.order, page, pageSize };

  const products = useQuery({
    queryKey: productKeys.list(query),
    queryFn: () => productsApi.list(query),
    placeholderData: keepPreviousData,
  });
  const categories = useQuery({ queryKey: ['categories'], queryFn: productsApi.categories });

  const setActive = useMutation({
    mutationFn: ({ ids, active }: { ids: number[]; active: boolean }) => productsApi.setActive(ids, active),
    onSuccess: async ({ updated }, { active }) => {
      setNotice(`${formatInteger(updated)} producto(s) ${active ? 'activados' : 'desactivados'}.`);
      setSelected(new Set());
      await queryClient.invalidateQueries({ queryKey: productKeys.all });
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const selectAllMatching = useMutation({
    mutationFn: () => productsApi.ids(filterQuery),
    onSuccess: ({ ids }) => setSelected(new Set(ids)),
  });

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  const items = products.data?.items ?? [];
  const total = products.data?.total ?? 0;
  const pageIds = useMemo(() => items.map((p) => p.id), [items]);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const hasFilters = !!search || filters.categoryId !== undefined || filters.labelStatus !== 'all' || filters.status !== 'active';

  function toggle(id: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePage() {
    setSelected((current) => {
      const next = new Set(current);
      for (const id of pageIds) {
        if (allPageSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  function changeSort(field: SortField) {
    setSort((current) =>
      current.field === field ? { field, order: current.order === 'asc' ? 'desc' : 'asc' } : { field, order: 'asc' },
    );
  }

  function deactivateSelected() {
    const count = selected.size;
    if (!window.confirm(`¿Desactivar ${count} producto(s)? Dejarán de aparecer en el catálogo, pero no se borran.`)) return;
    setActive.mutate({ ids: [...selected], active: false });
  }

  const sortHeader = (field: SortField, label: string, align: 'left' | 'right' = 'left'): ReactNode => (
    <button
      type="button"
      onClick={() => changeSort(field)}
      className={`inline-flex items-center gap-1 font-medium uppercase hover:text-slate-900 ${align === 'right' ? 'flex-row-reverse' : ''}`}
    >
      {label}
      {sort.field === field &&
        (sort.order === 'asc' ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />)}
    </button>
  );

  return (
    <>
      <PageHeader
        title="Catálogo"
        description="Buscá, editá y seleccioná productos."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus className="size-4" /> Nuevo producto
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-64 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Buscar por nombre, marca, código de barras o código interno…"
            className={`${inputClass} pl-9`}
            aria-label="Buscar productos"
            autoFocus
          />
        </div>
        <select
          className={selectClass}
          value={filters.categoryId ?? ''}
          onChange={(e) => setFilters((f) => ({ ...f, categoryId: e.target.value ? Number(e.target.value) : undefined }))}
          aria-label="Categoría"
        >
          <option value="">Todas las categorías</option>
          {categories.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.productCount})
            </option>
          ))}
        </select>
        <select
          className={selectClass}
          value={filters.labelStatus}
          onChange={(e) => setFilters((f) => ({ ...f, labelStatus: e.target.value as Filters['labelStatus'] }))}
          aria-label="Estado de la etiqueta"
        >
          <option value="all">Todas las etiquetas</option>
          <option value="outdated">Precio cambiado</option>
          <option value="never">Sin imprimir</option>
          <option value="current">Al día</option>
        </select>
        <select
          className={selectClass}
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as Filters['status'] }))}
          aria-label="Estado del producto"
        >
          <option value="active">Activos</option>
          <option value="inactive">Inactivos</option>
          <option value="all">Activos e inactivos</option>
        </select>
      </div>

      {notice && (
        <p role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          {notice}
        </p>
      )}
      {(products.error ?? setActive.error ?? selectAllMatching.error) && (
        <div className="mb-4">
          <ErrorMessage error={products.error ?? setActive.error ?? selectAllMatching.error} />
        </div>
      )}

      {selected.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm">
          <span className="font-medium text-emerald-900">{formatInteger(selected.size)} seleccionado(s)</span>
          {total > selected.size && (
            <Button variant="ghost" onClick={() => selectAllMatching.mutate()} disabled={selectAllMatching.isPending}>
              Seleccionar los {formatInteger(total)} que coinciden
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            <Button
              onClick={() => {
                printQueue.add([...selected]);
                navigate('/etiquetas');
              }}
            >
              <Printer className="size-4" /> Imprimir etiquetas
            </Button>
            <Button
              variant="secondary"
              onClick={() => setActive.mutate({ ids: [...selected], active: true })}
              disabled={setActive.isPending}
            >
              Activar
            </Button>
            <Button variant="danger" onClick={deactivateSelected} disabled={setActive.isPending}>
              Desactivar
            </Button>
            <Button variant="ghost" onClick={() => setSelected(new Set())}>
              Quitar selección
            </Button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-600 uppercase">
              <tr>
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={togglePage}
                    aria-label="Seleccionar todos los de esta página"
                    className="size-4 accent-emerald-600"
                  />
                </th>
                <th className="px-3 py-3">{sortHeader('name', 'Producto')}</th>
                <th className="px-3 py-3 font-medium">Código</th>
                <th className="px-3 py-3 font-medium">Categoría</th>
                <th className="px-3 py-3 text-right">{sortHeader('price', 'Precio', 'right')}</th>
                <th className="px-3 py-3 font-medium">Etiqueta</th>
                <th className="px-3 py-3">{sortHeader('priceUpdatedAt', 'Últ. cambio de precio')}</th>
              </tr>
            </thead>
            <tbody className={`divide-y divide-slate-100 ${products.isPlaceholderData ? 'opacity-60' : ''}`}>
              {items.map((product) => (
                <tr
                  key={product.id}
                  onClick={() => setEditing(product)}
                  className={`cursor-pointer hover:bg-slate-50 ${selected.has(product.id) ? 'bg-emerald-50/50' : ''}`}
                >
                  <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(product.id)}
                      onChange={() => toggle(product.id)}
                      aria-label={`Seleccionar ${product.name}`}
                      className="size-4 accent-emerald-600"
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <p className={`font-medium ${product.active ? '' : 'text-slate-400'}`}>
                      {product.name} {!product.active && <Badge>Inactivo</Badge>}
                    </p>
                    <p className="text-xs text-slate-500">
                      {[product.brand, product.presentation].filter(Boolean).join(' · ')}
                    </p>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-slate-600">
                    {product.barcode && <p>{product.barcode}</p>}
                    {product.sku && <p className="text-slate-400">{product.sku}</p>}
                  </td>
                  <td className="px-3 py-2.5 text-slate-600">{product.category ?? '—'}</td>
                  <td className="px-3 py-2.5 text-right font-semibold whitespace-nowrap tabular-nums">
                    {formatARS(product.priceCents)}
                  </td>
                  <td className="px-3 py-2.5">
                    <LabelStatusBadge status={product.labelStatus} />
                  </td>
                  <td className="px-3 py-2.5 text-xs whitespace-nowrap text-slate-500">
                    {formatDateTime(product.priceUpdatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {products.isPending && <EmptyState>Cargando productos…</EmptyState>}
        {products.data && total === 0 && (
          <EmptyState>
            {hasFilters
              ? 'No hay productos que coincidan con la búsqueda o los filtros.'
              : 'Todavía no hay productos. Cargá el primero con «Nuevo producto».'}
          </EmptyState>
        )}
        {total > 0 && (
          <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} />
        )}
      </div>

      {editing && (
        <ProductFormDialog
          key={editing === 'new' ? 'new' : editing.id}
          product={editing === 'new' ? null : editing}
          categories={categories.data ?? []}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
