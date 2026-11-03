/** Contratos de respuesta de la API compartidos entre servidor y frontend. */
import type { BackupStatus, PriceChangeListItem } from './history.js';

export interface ApiErrorBody {
  error: string;
  /** Errores por campo, cuando la validación falla. */
  fields?: Record<string, string[]>;
}

export interface ImportBatchSummary {
  id: number;
  fileName: string;
  createdAt: string;
  createdCount: number;
  updatedCount: number;
  unchangedCount: number;
  rejectedCount: number;
  priceChangeCount: number;
}

export interface PrintJobSummary {
  id: number;
  createdAt: string;
  templateName: string;
  labelCount: number;
  productCount: number;
}

export interface DashboardSummary {
  activeProducts: number;
  inactiveProducts: number;
  /** Productos activos que nunca tuvieron etiqueta impresa. */
  neverPrinted: number;
  /** Productos activos cuyo precio cambió desde la última etiqueta impresa. */
  priceChangedSinceLastPrint: number;
  recentImports: ImportBatchSummary[];
  recentPrintJobs: PrintJobSummary[];
  /** Últimos cambios de precio (ediciones e importaciones). */
  recentPriceChanges: PriceChangeListItem[];
  backup: BackupStatus;
}
