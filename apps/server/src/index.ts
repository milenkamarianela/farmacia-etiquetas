import { createApp } from './app.js';
import { config } from './config.js';
import { configureDatabase, prisma } from './db.js';
import { backupIfStale } from './modules/backup/backup.service.js';
import { ensureDefaultTemplate } from './modules/labels/templates.service.js';

/** Cada hora se verifica si corresponde la copia diaria (la PC puede quedar encendida varios días). */
const BACKUP_CHECK_INTERVAL_MS = 60 * 60 * 1000;

process.on('unhandledRejection', (reason) => {
  console.error('Error no controlado:', reason);
});

await configureDatabase();
await ensureDefaultTemplate();

async function dailyBackup() {
  try {
    const backup = await backupIfStale(prisma, config.backupDir, config.backupKeep);
    if (backup) console.log(`Copia de seguridad diaria creada: ${backup}`);
  } catch (error) {
    // Una copia fallida no debe impedir trabajar, pero tiene que verse en la consola.
    console.error('ATENCIÓN: no se pudo crear la copia de seguridad diaria:', error);
  }
}
await dailyBackup();
const backupTimer = setInterval(dailyBackup, BACKUP_CHECK_INTERVAL_MS);
backupTimer.unref();

const server = createApp().listen(config.port, config.host, () => {
  console.log(`Servidor listo en http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`);
});

server.on('error', async (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(
      `El puerto ${config.port} ya está en uso: probablemente la aplicación ya está abierta en otra ventana. ` +
        `Usala desde http://localhost:${config.port} o cerrá la otra ventana.`,
    );
  } else {
    console.error('No se pudo iniciar el servidor:', error);
  }
  await prisma.$disconnect();
  process.exit(1);
});

async function shutdown() {
  clearInterval(backupTimer);
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
