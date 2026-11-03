import { prisma } from '../src/db.js';
import { ensureDefaultTemplate } from '../src/modules/labels/templates.service.js';

/**
 * Datos mínimos para arrancar: la plantilla de etiqueta inicial y la configuración general.
 * Es idempotente: se puede ejecutar varias veces sin duplicar ni pisar lo que el usuario cambió.
 * (El servidor también asegura la plantilla al iniciar).
 */
try {
  await ensureDefaultTemplate();
  await prisma.setting.upsert({
    where: { key: 'pharmacyName' },
    update: {},
    create: { key: 'pharmacyName', value: '' },
  });
  console.log('Datos iniciales listos.');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
