import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Carpeta raíz del paquete del servidor (apps/server), independiente del directorio actual. */
export const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Las pruebas definen su propia base (vitest.config.ts): nunca deben leer el .env real.
if (!process.env.VITEST) {
  try {
    process.loadEnvFile(path.join(SERVER_ROOT, '.env'));
  } catch {
    // Sin archivo .env: se usan las variables de entorno del sistema o los valores por defecto.
  }
}

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`La variable de entorno ${name} debe ser un entero positivo (valor actual: "${raw}")`);
  }
  return value;
}

if (!process.env.DATABASE_URL) {
  throw new Error('Falta DATABASE_URL. Copiá apps/server/.env.example como apps/server/.env');
}

export const config = {
  host: process.env.HOST || '127.0.0.1',
  port: intFromEnv('PORT', 3000),
  backupDir: path.resolve(SERVER_ROOT, process.env.BACKUP_DIR || '../../backups'),
  backupKeep: intFromEnv('BACKUP_KEEP', 30),
  /** Build del frontend que el servidor sirve en producción. */
  webDistDir: path.resolve(SERVER_ROOT, '../web/dist'),
} as const;
