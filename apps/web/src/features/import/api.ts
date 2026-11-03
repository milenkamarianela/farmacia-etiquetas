import type {
  ImportAnalysis,
  ImportBatchSummary,
  ImportCommitResult,
  ImportRequest,
  ParsedImportFile,
} from '@etiquetas/shared';
import { api } from '../../lib/api';

export const importKeys = {
  batches: ['imports'] as const,
};

export const importApi = {
  parse: (file: File, sheet?: string) => {
    const form = new FormData();
    form.append('file', file);
    const query = sheet ? `?sheet=${encodeURIComponent(sheet)}` : '';
    return api.upload<ParsedImportFile>(`/imports/parse${query}`, form);
  },
  preview: (request: ImportRequest) => api.post<ImportAnalysis>('/imports/preview', request),
  commit: (request: ImportRequest) => api.post<ImportCommitResult>('/imports/commit', request),
  batches: () => api.get<ImportBatchSummary[]>('/imports'),
};
