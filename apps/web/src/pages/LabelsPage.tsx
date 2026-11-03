import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { EmptyState, ErrorMessage, PageHeader } from '../components/ui';
import { labelKeys, labelsApi } from '../features/labels/api';
import { PrintTab } from '../features/labels/PrintTab';
import { TemplatesTab } from '../features/labels/TemplatesTab';

const TABS = [
  { id: 'imprimir', label: 'Imprimir' },
  { id: 'plantillas', label: 'Plantillas' },
] as const;

export function LabelsPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('vista') === 'plantillas' ? 'plantillas' : 'imprimir';
  const templates = useQuery({ queryKey: labelKeys.templates, queryFn: labelsApi.templates });

  return (
    <>
      <PageHeader title="Etiquetas" description="Armá la lista, revisá la vista previa y generá el PDF para imprimir." />

      <div role="tablist" className="mb-6 flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setParams(t.id === 'imprimir' ? {} : { vista: t.id }, { replace: true })}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              tab === t.id ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {templates.error && <ErrorMessage error={templates.error} />}
      {templates.isPending && <EmptyState>Cargando…</EmptyState>}
      {templates.data && (tab === 'imprimir' ? <PrintTab templates={templates.data} /> : <TemplatesTab templates={templates.data} />)}
    </>
  );
}
