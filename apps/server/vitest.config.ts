import os from 'node:os';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Base de datos exclusiva para pruebas (relativa a prisma/). Se recrea en cada corrida.
export const TEST_DATABASE_URL = 'file:./test.db';

export default defineConfig({
  test: {
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      BACKUP_DIR: path.join(os.tmpdir(), 'etiquetas-farmacia-test-backups'),
    },
    globalSetup: ['./tests/global-setup.ts'],
    // Todas las pruebas comparten la misma base SQLite: se ejecutan en serie.
    fileParallelism: false,
  },
});
