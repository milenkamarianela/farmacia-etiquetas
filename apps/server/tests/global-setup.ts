import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEST_DATABASE_URL } from '../vitest.config.js';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testDbFile = path.join(serverRoot, 'prisma', TEST_DATABASE_URL.replace(/^file:/, ''));

/** Recrea la base de pruebas desde cero: borra el archivo y aplica todas las migraciones. */
export default function setup() {
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    rmSync(testDbFile + suffix, { force: true });
  }
  execSync('npx prisma migrate deploy', {
    cwd: serverRoot,
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'pipe',
  });
}
