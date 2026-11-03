import { IMPORT_FILE_EXTENSIONS, MAX_IMPORT_FILE_BYTES, type ParsedImportFile } from '@etiquetas/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { FileSpreadsheet, Upload } from 'lucide-react';
import { type DragEvent, useRef, useState } from 'react';
import { Card, EmptyState, ErrorMessage } from '../../components/ui';
import { formatDateTime } from '../../lib/format';
import { importApi, importKeys } from './api';

/** Valida tipo y tamaño antes de subir (el servidor vuelve a validar). */
function checkFile(file: File): string | null {
  const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  if (extension === '.xls') {
    return 'Los archivos .xls (Excel 97-2003) no son compatibles. Abrilo en Excel y usá "Guardar como" → .xlsx o CSV.';
  }
  if (!(IMPORT_FILE_EXTENSIONS as readonly string[]).includes(extension)) {
    return 'Formato no compatible. Elegí un archivo Excel (.xlsx) o CSV.';
  }
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    return `El archivo pesa más de ${MAX_IMPORT_FILE_BYTES / 1024 / 1024} MB.`;
  }
  return null;
}

export function UploadStep({ onParsed }: { onParsed: (file: File, parsed: ParsedImportFile) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const parse = useMutation({
    mutationFn: (file: File) => importApi.parse(file),
    onSuccess: (parsed, file) => onParsed(file, parsed),
  });
  const batches = useQuery({ queryKey: importKeys.batches, queryFn: importApi.batches });

  function handleFile(file: File | undefined) {
    if (!file) return;
    const problem = checkFile(file);
    setLocalError(problem);
    if (!problem) parse.mutate(file);
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    handleFile(event.dataTransfer.files[0]);
  }

  return (
    <div className="space-y-6">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-14 text-center transition-colors ${
          dragging ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300 bg-white'
        }`}
      >
        <FileSpreadsheet className="mb-3 size-10 text-slate-400" />
        <p className="font-medium">Arrastrá acá la lista de precios</p>
        <p className="mt-1 text-sm text-slate-500">Excel (.xlsx) o CSV, hasta 10 MB</p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={parse.isPending}
          className="mt-4 inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:bg-emerald-300"
        >
          <Upload className="size-4" />
          {parse.isPending ? 'Leyendo archivo…' : 'Elegir archivo'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={IMPORT_FILE_EXTENSIONS.join(',')}
          className="hidden"
          onChange={(e) => {
            handleFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <p className="mt-6 max-w-md text-xs text-slate-500">
          Nada se modifica todavía: primero vas a ver qué columnas se usan y cómo queda cada producto, y recién
          después confirmás.
        </p>
      </div>

      {(localError ?? parse.error) && <ErrorMessage error={localError ? new Error(localError) : parse.error} />}

      <Card title="Importaciones anteriores">
        {batches.error && <ErrorMessage error={batches.error} />}
        {batches.data?.length === 0 && <EmptyState>Todavía no se importó ningún archivo.</EmptyState>}
        <ul className="divide-y divide-slate-100">
          {batches.data?.map((batch) => (
            <li key={batch.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <div>
                <p className="font-medium">{batch.fileName}</p>
                <p className="text-xs text-slate-500">{formatDateTime(batch.createdAt)}</p>
              </div>
              <p className="text-xs text-slate-500">
                {batch.createdCount} nuevos · {batch.updatedCount} actualizados ({batch.priceChangeCount} con precio
                nuevo) · {batch.unchangedCount} sin cambios · {batch.rejectedCount} rechazados
              </p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
