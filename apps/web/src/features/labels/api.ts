import type {
  LabelTemplateDto,
  LabelTemplateInput,
  PrintJobCreated,
  PrintJobInput,
  PrintJobSummary,
  ProductDto,
  Settings,
} from '@etiquetas/shared';
import { api } from '../../lib/api';

export const labelKeys = {
  templates: ['label-templates'] as const,
  settings: ['settings'] as const,
  printJobs: ['print-jobs'] as const,
  productsByIds: (ids: number[]) => ['products', 'by-ids', ids] as const,
};

export const labelsApi = {
  templates: () => api.get<LabelTemplateDto[]>('/label-templates'),
  createTemplate: (input: LabelTemplateInput) => api.post<LabelTemplateDto>('/label-templates', input),
  updateTemplate: (id: number, input: LabelTemplateInput) => api.put<LabelTemplateDto>(`/label-templates/${id}`, input),
  setDefaultTemplate: (id: number) => api.post<LabelTemplateDto>(`/label-templates/${id}/default`),
  deleteTemplate: (id: number) => api.delete(`/label-templates/${id}`),
  settings: () => api.get<Settings>('/settings'),
  saveSettings: (settings: Settings) => api.put<Settings>('/settings', settings),
  productsByIds: (ids: number[]) => api.post<ProductDto[]>('/products/by-ids', { ids }),
  createPrintJob: (input: PrintJobInput) => api.post<PrintJobCreated>('/print-jobs', input),
  printJobs: () => api.get<PrintJobSummary[]>('/print-jobs'),
  pdfUrl: (printJobId: number) => `/api/print-jobs/${printJobId}/pdf`,
};
