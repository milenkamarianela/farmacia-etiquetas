import {
  DEFAULT_LABEL_TEMPLATE,
  type LabelProductData,
  type LabelTemplateDto,
  type LabelTemplateInput,
  computeSheetLayout,
  labelTemplateInputSchema,
  layoutLabel,
} from '@etiquetas/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Star } from 'lucide-react';
import { type ChangeEvent, type ReactNode, useEffect, useState } from 'react';
import { Dialog } from '../../components/Dialog';
import { Badge, Button, Card, ErrorMessage, Field, inputClass } from '../../components/ui';
import { ApiError } from '../../lib/api';
import { labelKeys, labelsApi } from './api';
import { LabelSvg, SheetSvg } from './LabelSvg';

/** Producto de ejemplo para previsualizar plantillas. */
const SAMPLE: LabelProductData = {
  name: 'Ibuprofeno 400 mg comprimidos recubiertos',
  brand: 'Genérico',
  presentation: 'x 20 comprimidos',
  sku: 'IBU-400',
  barcode: '7791234567898',
  priceCents: 1_245_000,
};

export function TemplatesTab({ templates }: { templates: LabelTemplateDto[] }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<LabelTemplateDto | 'new' | null>(null);
  const settings = useQuery({ queryKey: labelKeys.settings, queryFn: labelsApi.settings });
  const pharmacyName = settings.data?.pharmacyName ?? '';

  const invalidate = () => queryClient.invalidateQueries({ queryKey: labelKeys.templates });
  const setDefault = useMutation({ mutationFn: labelsApi.setDefaultTemplate, onSuccess: invalidate });
  const remove = useMutation({ mutationFn: labelsApi.deleteTemplate, onSuccess: invalidate });

  return (
    <div className="space-y-6">
      <PharmacyNameCard current={pharmacyName} />

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Plantillas</h2>
        <Button onClick={() => setEditing('new')}>
          <Plus className="size-4" /> Nueva plantilla
        </Button>
      </div>
      {(setDefault.error ?? remove.error) && <ErrorMessage error={setDefault.error ?? remove.error} />}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {templates.map((template) => (
          <div key={template.id} className="flex flex-col rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">{template.name}</p>
                <p className="text-xs text-slate-500">
                  {template.widthMm} × {template.heightMm} mm · {template.perPage} por hoja
                </p>
              </div>
              {template.isDefault && <Badge tone="success">Predeterminada</Badge>}
            </div>
            <div className="my-4 flex flex-1 items-center justify-center rounded-lg bg-slate-100 p-4">
              <LabelSvg
                layout={layoutLabel(SAMPLE, template, { pharmacyName })}
                className="max-h-40 w-full max-w-64 shadow-sm"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setEditing(template)}>
                Editar
              </Button>
              {!template.isDefault && (
                <Button variant="ghost" onClick={() => setDefault.mutate(template.id)}>
                  <Star className="size-4" /> Predeterminada
                </Button>
              )}
              <Button
                variant="danger"
                className="ml-auto"
                disabled={template.usedInPrintJobs || templates.length === 1}
                title={template.usedInPrintJobs ? 'Se usó para imprimir: figura en el historial' : undefined}
                onClick={() => window.confirm(`¿Borrar la plantilla «${template.name}»?`) && remove.mutate(template.id)}
              >
                Borrar
              </Button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <TemplateFormDialog
          key={editing === 'new' ? 'new' : editing.id}
          template={editing === 'new' ? null : editing}
          pharmacyName={pharmacyName}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function PharmacyNameCard({ current }: { current: string }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(current);
  useEffect(() => setValue(current), [current]);
  const save = useMutation({
    mutationFn: () => labelsApi.saveSettings({ pharmacyName: value }),
    onSuccess: (settings) => queryClient.setQueryData(labelKeys.settings, settings),
  });

  return (
    <Card title="Nombre de la farmacia">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="min-w-64 flex-1">
          <input
            className={inputClass}
            value={value}
            maxLength={80}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Ej: Farmacia Central"
            aria-label="Nombre de la farmacia"
          />
          <p className="mt-1 text-xs text-slate-500">
            Se imprime en las plantillas que tengan activada la opción «Nombre de la farmacia».
          </p>
        </div>
        <Button type="submit" variant="secondary" disabled={save.isPending || value.trim() === current}>
          {save.isPending ? 'Guardando…' : save.isSuccess && value.trim() === current ? 'Guardado' : 'Guardar'}
        </Button>
      </form>
      {save.error && <ErrorMessage error={save.error} />}
    </Card>
  );
}

type FormState = LabelTemplateInput & { config: typeof DEFAULT_LABEL_TEMPLATE.config };

function TemplateFormDialog(props: { template: LabelTemplateDto | null; pharmacyName: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [initial] = useState<FormState>(() =>
    props.template
      ? { name: props.template.name, widthMm: props.template.widthMm, heightMm: props.template.heightMm, config: props.template.config }
      : { ...DEFAULT_LABEL_TEMPLATE, name: '' },
  );
  const [form, setForm] = useState(initial);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: (input: LabelTemplateInput) =>
      props.template ? labelsApi.updateTemplate(props.template.id, input) : labelsApi.createTemplate(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: labelKeys.templates });
      props.onClose();
    },
    onError: (error) => {
      if (error instanceof ApiError && error.fields) {
        setFieldErrors(Object.fromEntries(Object.entries(error.fields).map(([k, v]) => [k, v[0] ?? ''])));
      }
    },
  });

  const parsed = labelTemplateInputSchema.safeParse(form);
  let sheetInfo: { perPage: number; columns: number; rows: number } | null = null;
  let sheetError: string | null = null;
  if (parsed.success) {
    try {
      sheetInfo = computeSheetLayout(form.widthMm, form.heightMm, form.config.sheet);
    } catch (error) {
      sheetError = (error as Error).message;
    }
  }
  const layout = parsed.success ? layoutLabel(SAMPLE, form, { pharmacyName: props.pharmacyName || 'Farmacia' }) : null;
  const isDirty = JSON.stringify(form) !== JSON.stringify(initial);

  const setNumber = (update: (value: number) => FormState) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm(update(e.target.value === '' ? Number.NaN : Number(e.target.value)));
  const setSheet = (key: keyof FormState['config']['sheet']) =>
    setNumber((value) => ({ ...form, config: { ...form.config, sheet: { ...form.config.sheet, [key]: value } } }));
  const setStyle = (key: 'nameFontSizePt' | 'priceFontSizePt') =>
    setNumber((value) => ({ ...form, config: { ...form.config, style: { ...form.config.style, [key]: value } } }));
  const setField = (key: keyof FormState['config']['fields'], value: boolean) =>
    setForm({ ...form, config: { ...form.config, fields: { ...form.config.fields, [key]: value } } });

  function requestClose() {
    if (save.isPending) return;
    if (isDirty && !window.confirm('Hay cambios sin guardar. ¿Descartarlos?')) return;
    props.onClose();
  }

  function submit() {
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) errors[issue.path.join('.')] ??= issue.message;
      setFieldErrors(errors);
      return;
    }
    if (sheetError) return;
    save.mutate(parsed.data);
  }

  const err = (path: string) =>
    fieldErrors[path] ?? (parsed.success ? undefined : parsed.error.issues.find((i) => i.path.join('.') === path)?.message);

  return (
    <Dialog
      title={props.template ? 'Editar plantilla' : 'Nueva plantilla'}
      onRequestClose={requestClose}
      className="max-w-5xl"
      footer={
        <>
          <Button variant="secondary" onClick={requestClose} disabled={save.isPending}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={save.isPending || !!sheetError}>
            {save.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          {save.error && !(save.error instanceof ApiError && save.error.fields) && <ErrorMessage error={save.error} />}
          {props.template?.usedInPrintJobs && (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Las impresiones anteriores guardaron su propia copia: editar la plantilla no las modifica.
            </p>
          )}
          <Field label="Nombre" htmlFor="tpl-name" required error={fieldErrors.name}>
            <input
              id="tpl-name"
              className={inputClass}
              value={form.name}
              maxLength={100}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              autoFocus
            />
          </Field>

          <Section title="Tamaño de la etiqueta">
            <NumberField id="tpl-w" label="Ancho (mm)" value={form.widthMm} onChange={setNumber((v) => ({ ...form, widthMm: v }))} error={err('widthMm')} />
            <NumberField id="tpl-h" label="Alto (mm)" value={form.heightMm} onChange={setNumber((v) => ({ ...form, heightMm: v }))} error={err('heightMm')} />
          </Section>

          <Section title="Hoja">
            <NumberField id="tpl-pw" label="Ancho de hoja (mm)" value={form.config.sheet.pageWidthMm} onChange={setSheet('pageWidthMm')} error={err('config.sheet.pageWidthMm')} />
            <NumberField id="tpl-ph" label="Alto de hoja (mm)" value={form.config.sheet.pageHeightMm} onChange={setSheet('pageHeightMm')} error={err('config.sheet.pageHeightMm')} />
            <NumberField id="tpl-mt" label="Margen superior (mm)" value={form.config.sheet.marginTopMm} onChange={setSheet('marginTopMm')} error={err('config.sheet.marginTopMm')} />
            <NumberField id="tpl-ml" label="Margen izquierdo (mm)" value={form.config.sheet.marginLeftMm} onChange={setSheet('marginLeftMm')} error={err('config.sheet.marginLeftMm')} />
            <NumberField id="tpl-gx" label="Separación horizontal (mm)" value={form.config.sheet.gapXMm} onChange={setSheet('gapXMm')} error={err('config.sheet.gapXMm')} />
            <NumberField id="tpl-gy" label="Separación vertical (mm)" value={form.config.sheet.gapYMm} onChange={setSheet('gapYMm')} error={err('config.sheet.gapYMm')} />
          </Section>

          <Section title="Contenido">
            <div className="col-span-2 grid gap-2 text-sm sm:grid-cols-2">
              {(
                [
                  ['showBrand', 'Marca / laboratorio'],
                  ['showPresentation', 'Presentación'],
                  ['showBarcode', 'Código de barras'],
                  ['showSku', 'Código interno'],
                  ['showPharmacyName', 'Nombre de la farmacia'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="size-4 accent-emerald-600"
                    checked={form.config.fields[key]}
                    onChange={(e) => setField(key, e.target.checked)}
                  />
                  {label}
                </label>
              ))}
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="size-4 accent-emerald-600"
                  checked={form.config.style.showCutGuides}
                  onChange={(e) =>
                    setForm({ ...form, config: { ...form.config, style: { ...form.config.style, showCutGuides: e.target.checked } } })
                  }
                />
                Guías de corte
              </label>
            </div>
            <NumberField id="tpl-ns" label="Tamaño del nombre (pt)" value={form.config.style.nameFontSizePt} onChange={setStyle('nameFontSizePt')} error={err('config.style.nameFontSizePt')} />
            <NumberField id="tpl-ps" label="Tamaño máximo del precio (pt)" value={form.config.style.priceFontSizePt} onChange={setStyle('priceFontSizePt')} error={err('config.style.priceFontSizePt')} />
          </Section>
        </div>

        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium">Etiqueta</p>
            <div className="flex min-h-40 items-center justify-center rounded-lg bg-slate-100 p-4">
              {layout ? <LabelSvg layout={layout} className="max-h-64 w-full shadow" /> : <p className="text-sm text-slate-500">Completá las medidas.</p>}
            </div>
            {layout?.warnings.map((w) => (
              <p key={w} className="mt-1 text-xs text-amber-700">
                {w}
              </p>
            ))}
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">
              Hoja{' '}
              {sheetInfo && (
                <span className="font-normal text-slate-500">
                  ({sheetInfo.columns} × {sheetInfo.rows} = {sheetInfo.perPage} etiquetas)
                </span>
              )}
            </p>
            {sheetError && <p className="text-sm text-red-700">{sheetError}</p>}
            {layout && sheetInfo && (
              <div className="rounded-lg bg-slate-200 p-3">
                <SheetSvg template={form} slots={Array(sheetInfo.perPage).fill(layout)} className="mx-auto w-full max-w-xs shadow" />
              </div>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold">{title}</legend>
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </fieldset>
  );
}

function NumberField(props: {
  id: string;
  label: string;
  value: number;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  error?: string;
}) {
  return (
    <Field label={props.label} htmlFor={props.id} error={props.error}>
      <input
        id={props.id}
        type="number"
        step="0.1"
        min={0}
        className={inputClass}
        value={Number.isNaN(props.value) ? '' : props.value}
        onChange={props.onChange}
        aria-invalid={!!props.error}
      />
    </Field>
  );
}
