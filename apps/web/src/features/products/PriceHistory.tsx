import { type PriceChangeSource, formatARS } from '@etiquetas/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { EmptyState, ErrorMessage } from '../../components/ui';
import { formatDateTime, formatPercentChange } from '../../lib/format';
import { productKeys, productsApi } from './api';

const SOURCE_LABELS: Record<PriceChangeSource, string> = {
  CREATE: 'Alta',
  MANUAL: 'Edición manual',
  IMPORT: 'Importación',
};

export function PriceHistory({ productId }: { productId: number }) {
  const { data, error, isPending } = useQuery({
    queryKey: productKeys.priceChanges(productId),
    queryFn: () => productsApi.priceChanges(productId),
  });

  if (error) return <ErrorMessage error={error} />;
  if (isPending) return <p className="text-sm text-slate-500">Cargando…</p>;
  if (data.length === 0) return <EmptyState>Sin cambios registrados.</EmptyState>;

  return (
    <ul className="divide-y divide-slate-100 text-sm">
      {data.map((change) => (
        <li key={change.id} className="flex items-center justify-between gap-4 py-2">
          <div>
            <p className="flex items-center gap-2 tabular-nums">
              {change.oldPriceCents !== null && (
                <>
                  <span className="text-slate-500">{formatARS(change.oldPriceCents)}</span>
                  <ArrowRight className="size-3.5 text-slate-400" />
                </>
              )}
              <span className="font-medium">{formatARS(change.newPriceCents)}</span>
              {change.oldPriceCents !== null && (
                <span className="text-xs text-slate-500">{formatPercentChange(change.oldPriceCents, change.newPriceCents)}</span>
              )}
            </p>
            <p className="text-xs text-slate-500">{SOURCE_LABELS[change.source]}</p>
          </div>
          <p className="text-xs text-slate-500">{formatDateTime(change.changedAt)}</p>
        </li>
      ))}
    </ul>
  );
}
