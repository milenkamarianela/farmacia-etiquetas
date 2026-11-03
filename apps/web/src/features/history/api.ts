import type {
  BackupStatus,
  Paginated,
  PaginationQuery,
  PriceChangeListItem,
  PriceChangeQuery,
  PrintJobDetail,
  PrintJobSummary,
} from '@etiquetas/shared';
import { api } from '../../lib/api';

function toSearchParams(query: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '' && value !== null) params.set(key, String(value));
  }
  return params.toString();
}

export const historyKeys = {
  priceChanges: (query: PriceChangeQuery) => ['price-changes', query] as const,
  printJobs: (query: PaginationQuery) => ['print-jobs', query] as const,
  printJob: (id: number) => ['print-jobs', 'detail', id] as const,
  backups: ['backups'] as const,
};

export const historyApi = {
  priceChanges: (query: PriceChangeQuery) =>
    api.get<Paginated<PriceChangeListItem>>(`/price-changes?${toSearchParams(query)}`),
  printJobs: (query: PaginationQuery) => api.get<Paginated<PrintJobSummary>>(`/print-jobs?${toSearchParams(query)}`),
  printJob: (id: number) => api.get<PrintJobDetail>(`/print-jobs/${id}`),
  backupStatus: () => api.get<BackupStatus>('/backups'),
  createBackup: () => api.post<BackupStatus>('/backups'),
};
