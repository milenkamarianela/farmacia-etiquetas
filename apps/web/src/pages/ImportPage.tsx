import {
  type ColumnMapping,
  type ImportAnalysis,
  type ImportCommitResult,
  type ImportOptions,
  type ImportRequest,
  type ImportRow,
  type ParsedImportFile,
  headersFromCells,
  suggestMapping,
  validateMapping,
} from '@etiquetas/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, CheckCircle2, Download } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Button, ErrorMessage, PageHeader } from '../components/ui';
import { importApi, importKeys } from '../features/import/api';
import { MappingStep } from '../features/import/MappingStep';
import { buildRejectedCsv, downloadText } from '../features/import/rejectedCsv';
import { ReviewStep } from '../features/import/ReviewStep';
import { UploadStep } from '../features/import/UploadStep';
import { formatInteger, plural } from '../lib/format';

type Step = 'upload' | 'mapping' | 'review' | 'done';
const STEPS: { id: Step; label: string }[] = [
  { id: 'upload', label: 'Archivo' },
  { id: 'mapping', label: 'Columnas' },
  { id: 'review', label: 'Revisión' },
  { id: 'done', label: 'Listo' },
];
const HEADER_CANDIDATES = 10;
const DEFAULT_OPTIONS: ImportOptions = { createNew: true, updateDetails: false };

interface Source {
  file: File;
  parsed: ParsedImportFile;
}

export function ImportPage() {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>('upload');
  const [source, setSource] = useState<Source | null>(null);
  const [headerRow, setHeaderRow] = useState(1);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [options, setOptions] = useState<ImportOptions>(DEFAULT_OPTIONS);
  const [analysis, setAnalysis] = useState<ImportAnalysis | null>(null);
  const [result, setResult] = useState<ImportCommitResult | null>(null);
  const [mappingErrors, setMappingErrors] = useState<string[]>([]);

  // Todas las filas del archivo (incluido el encabezado detectado) para poder elegir otro encabezado.
  const allRows = useMemo<ImportRow[]>(() => {
    if (!source) return [];
    const { parsed } = source;
    return [{ rowNumber: parsed.headerRowNumber, cells: parsed.headers }, ...parsed.rows];
  }, [source]);

  const columnCount = source?.parsed.headers.length ?? 0;
  const headers = useMemo(
    () => headersFromCells(allRows.find((r) => r.rowNumber === headerRow)?.cells ?? [], columnCount),
    [allRows, headerRow, columnCount],
  );
  const dataRows = useMemo(() => allRows.filter((r) => r.rowNumber > headerRow), [allRows, headerRow]);

  function loadParsed(file: File, parsed: ParsedImportFile) {
    setSource({ file, parsed });
    setHeaderRow(parsed.headerRowNumber);
    setMapping(parsed.suggestedMapping);
    setMappingErrors([]);
    setStep('mapping');
  }

  const changeSheet = useMutation({
    mutationFn: (sheet: string) => importApi.parse(source!.file, sheet),
    onSuccess: (parsed) => loadParsed(source!.file, parsed),
  });

  const buildRequest = (): ImportRequest => ({
    fileName: source!.parsed.fileName,
    rows: dataRows,
    mapping: mapping!,
    options,
  });

  const preview = useMutation({
    mutationFn: () => importApi.preview(buildRequest()),
    onSuccess: (data) => {
      setAnalysis(data);
      setStep('review');
    },
  });

  const commit = useMutation({
    mutationFn: () => importApi.commit(buildRequest()),
    onSuccess: async (data) => {
      setResult(data);
      setStep('done');
      await Promise.all(
        [['products'], ['dashboard'], ['categories'], importKeys.batches].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
    },
  });

  function analyze() {
    if (!mapping) return;
    const errors = validateMapping(mapping);
    setMappingErrors(errors);
    if (errors.length === 0) preview.mutate();
  }

  function confirmImport() {
    if (!analysis) return;
    const { summary } = analysis;
    const lines = [
      plural(summary.create, 'producto nuevo', 'productos nuevos'),
      `${plural(summary.update, 'producto actualizado', 'productos actualizados')} (${formatInteger(summary.priceChanged)} con precio nuevo)`,
      summary.reject > 0 ? `${plural(summary.reject, 'fila rechazada', 'filas rechazadas')} que NO se importan` : null,
    ].filter(Boolean);
    if (window.confirm(`¿Confirmar la importación?\n\n${lines.join('\n')}\n\nAntes se hace una copia de seguridad.`)) {
      commit.mutate();
    }
  }

  function restart() {
    setStep('upload');
    setSource(null);
    setMapping(null);
    setAnalysis(null);
    setResult(null);
    setOptions(DEFAULT_OPTIONS);
    preview.reset();
    commit.reset();
  }

  const canApply = analysis !== null && analysis.summary.create + analysis.summary.update > 0;

  return (
    <>
      <PageHeader title="Importación" description="Actualizá precios y productos desde un Excel o CSV." />
      <Stepper current={step} />

      {step === 'upload' && <UploadStep onParsed={loadParsed} />}

      {step === 'mapping' && source && mapping && (
        <>
          <MappingStep
            headers={headers}
            rows={dataRows}
            mapping={mapping}
            onMappingChange={(next) => {
              setMapping(next);
              setMappingErrors([]);
            }}
            options={options}
            onOptionsChange={setOptions}
            header={{
              candidates: allRows.slice(0, HEADER_CANDIDATES),
              selected: headerRow,
              onChange: (rowNumber) => {
                setHeaderRow(rowNumber);
                const cells = allRows.find((r) => r.rowNumber === rowNumber)?.cells ?? [];
                setMapping(suggestMapping(headersFromCells(cells, columnCount)));
              },
            }}
            sheet={{
              names: source.parsed.sheetNames,
              selected: source.parsed.sheet,
              onChange: (name) => changeSheet.mutate(name),
              loading: changeSheet.isPending,
            }}
          />
          <ActionBar>
            <div className="flex-1 space-y-1">
              {mappingErrors.map((error) => (
                <p key={error} className="text-sm text-red-700">
                  {error}
                </p>
              ))}
              {(preview.error ?? changeSheet.error) && <ErrorMessage error={preview.error ?? changeSheet.error} />}
            </div>
            <Button variant="secondary" onClick={restart}>
              <ArrowLeft className="size-4" /> Otro archivo
            </Button>
            <Button onClick={analyze} disabled={preview.isPending || dataRows.length === 0}>
              {preview.isPending ? 'Analizando…' : `Analizar ${formatInteger(dataRows.length)} filas`}
            </Button>
          </ActionBar>
        </>
      )}

      {step === 'review' && source && analysis && (
        <>
          <ReviewStep analysis={analysis} />
          <ActionBar>
            <div className="flex-1">{commit.error && <ErrorMessage error={commit.error} />}</div>
            {analysis.summary.reject > 0 && (
              <Button
                variant="secondary"
                onClick={() =>
                  downloadText(
                    buildRejectedCsv(headers, dataRows, analysis.rows),
                    `rechazados - ${source.parsed.fileName.replace(/\.[^.]+$/, '')}.csv`,
                  )
                }
              >
                <Download className="size-4" /> Descargar rechazados
              </Button>
            )}
            <Button variant="secondary" onClick={() => setStep('mapping')} disabled={commit.isPending}>
              <ArrowLeft className="size-4" /> Columnas
            </Button>
            <Button onClick={confirmImport} disabled={!canApply || commit.isPending}>
              {commit.isPending
                ? 'Importando…'
                : canApply
                  ? 'Confirmar importación'
                  : 'No hay cambios para aplicar'}
            </Button>
          </ActionBar>
        </>
      )}

      {step === 'done' && result && (
        <div className="rounded-xl border border-emerald-200 bg-white p-8 text-center">
          <CheckCircle2 className="mx-auto mb-3 size-12 text-emerald-600" />
          <h2 className="text-lg font-semibold">Importación terminada</h2>
          <p className="mt-2 text-sm text-slate-600">
            {plural(result.summary.create, 'producto nuevo', 'productos nuevos')} ·{' '}
            {plural(result.summary.update, 'actualizado', 'actualizados')} (
            {formatInteger(result.summary.priceChanged)} con precio nuevo) · {formatInteger(result.summary.unchanged)} sin
            cambios · {plural(result.summary.reject, 'rechazado', 'rechazados')}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Copia de seguridad previa: {result.backupFile.split(/[\\/]/).pop()}
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Link
              to="/productos?etiqueta=outdated"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Ver etiquetas con precio cambiado
            </Link>
            <Button onClick={restart}>Importar otro archivo</Button>
          </div>
        </div>
      )}
    </>
  );
}

function Stepper({ current }: { current: Step }) {
  const currentIndex = STEPS.findIndex((s) => s.id === current);
  return (
    <ol className="mb-6 flex flex-wrap items-center gap-2 text-sm">
      {STEPS.map((step, index) => {
        const done = index < currentIndex;
        const active = index === currentIndex;
        return (
          <li key={step.id} className="flex items-center gap-2">
            <span
              className={`flex size-6 items-center justify-center rounded-full text-xs font-semibold ${
                done ? 'bg-emerald-600 text-white' : active ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-500'
              }`}
            >
              {done ? <Check className="size-3.5" /> : index + 1}
            </span>
            <span className={active ? 'font-medium' : 'text-slate-500'}>{step.label}</span>
            {index < STEPS.length - 1 && <span className="mx-1 h-px w-8 bg-slate-300" />}
          </li>
        );
      })}
    </ol>
  );
}

function ActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 mt-6 -mx-8 flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-white/95 px-8 py-4 backdrop-blur">
      {children}
    </div>
  );
}
