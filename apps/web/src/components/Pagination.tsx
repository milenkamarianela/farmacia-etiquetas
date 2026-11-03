import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatInteger } from '../lib/format';
import { Button } from './ui';

const PAGE_SIZES = [25, 50, 100, 200];

export function Pagination(props: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  const { page, pageSize, total } = props;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-600">
      <p>
        {formatInteger(from)}–{formatInteger(to)} de {formatInteger(total)}
      </p>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2">
          Por página
          <select
            value={pageSize}
            onChange={(e) => props.onPageSizeChange(Number(e.target.value))}
            className="rounded-md border border-slate-300 bg-white px-2 py-1"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <Button variant="secondary" disabled={page <= 1} onClick={() => props.onPageChange(page - 1)} aria-label="Página anterior">
          <ChevronLeft className="size-4" />
        </Button>
        <span className="tabular-nums">
          {page} / {pageCount}
        </span>
        <Button
          variant="secondary"
          disabled={page >= pageCount}
          onClick={() => props.onPageChange(page + 1)}
          aria-label="Página siguiente"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
