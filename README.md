# Etiquetas de góndola — Farmacia

Aplicación web local para administrar el catálogo de productos, importar precios desde Excel/CSV
e imprimir etiquetas de góndola en PDF con medidas exactas en milímetros.

## Requisitos

- Node.js 22 o superior (instalado: 26 LTS)
- Windows, macOS o Linux

## Primera instalación

```bash
npm install
```

Si es una PC nueva, copiá `apps/server/.env.example` como `apps/server/.env` y ajustá `DATABASE_URL`
(ver la sección *Datos y copias de seguridad*). Después creá la base y los datos iniciales:

```bash
npm run db:deploy
```

```bash
npm run db:seed
```

## Uso diario

Doble clic en **`Iniciar Etiquetas.cmd`** (conviene crear un acceso directo en el Escritorio). Instala y
prepara lo necesario la primera vez, inicia el servidor y abre <http://localhost:3000> cuando está listo.
La ventana negra tiene que quedar abierta mientras se usa la aplicación.

Equivalente manual:

```bash
npm run build
```

```bash
npm start
```

El servidor aplica migraciones pendientes al arrancar, asegura que exista una plantilla de etiqueta y
revisa cada hora si corresponde la copia de seguridad diaria.

**Después de actualizar el código** hay que volver a compilar la pantalla (`npm run build`): el
lanzador solo compila si todavía no existe `apps/web/dist`.

### Problemas frecuentes

| Síntoma | Qué hacer |
|---|---|
| «El puerto 3000 ya está en uso» | La aplicación ya está abierta en otra ventana: usá esa o cerrala. |
| Las etiquetas salen más chicas o corridas | Imprimir con «Tamaño real» / 100 %. La regla de la primera hoja debe medir 100 mm. Si mide bien y aun así no coinciden con las hojas autoadhesivas, ajustar márgenes y separaciones de la plantilla. |
| El lector no lee el código de barras | Probar con la hoja de muestra (`npm run labels:sample`); evitar plantillas angostas (el aviso de diseño lo indica). |
| Se borró o rompió algo | Restaurar una copia de seguridad (ver *Datos y copias de seguridad*). |

## Desarrollo

```bash
npm run dev
```

- Frontend con recarga en vivo: <http://localhost:5173> (redirige `/api` al servidor)
- API: <http://127.0.0.1:3000/api>

Otros comandos:

| Comando | Qué hace |
|---|---|
| `npm test` | Pruebas automatizadas: paquete compartido, servidor (con base de pruebas aparte) y pantallas (jsdom) |
| `npm run typecheck` | Chequeo de tipos de los tres paquetes |
| `npm run db:migrate` | Crea una migración nueva tras cambiar `schema.prisma` (solo desarrollo) |
| `npm run db:studio` | Explorador visual de la base de datos |
| `npm run backup` | Copia de seguridad manual |

## Arquitectura

```
apps/
  server/            Express + Prisma (API REST en /api)
    prisma/          schema.prisma, migraciones y datos iniciales (seed)
    src/
      modules/<área>/  rutas (*.routes.ts) + lógica de negocio (*.service.ts)
      lib/           errores y utilidades HTTP
    tests/           pruebas de integración contra una base SQLite de pruebas
  web/               React + Vite + Tailwind + TanStack Query
    src/pages/       una página por sección
    src/components/  componentes reutilizables
    src/lib/         cliente de la API y formatos
packages/
  shared/            Código usado por servidor Y frontend: validaciones (zod),
                     formato/lectura de precios, códigos de barras, layout de etiquetas
```

Decisiones principales:

- **Precios en centavos enteros** (`BigInt` en la base, `number` en la API). `$ 12.450,00` se guarda
  como `1245000`. Nunca se usa punto flotante para dinero.
- **Validación compartida**: las mismas reglas (`packages/shared`) validan en el formulario y en el servidor.
- **Identificación de productos al importar**: por código de barras; si la fila no lo trae, por código
  interno (SKU). Ambos son únicos. Sin ninguno de los dos, la fila se rechaza.
- **Los productos no se borran**, se desactivan: así se conserva su historial de precios e impresiones.
- **Pendientes de impresión**: cada producto guarda el precio de su última etiqueta impresa
  (`lastPrintedPriceCents`). Si difiere del precio actual, la etiqueta está desactualizada.
- **Plantillas de etiqueta** con configuración JSON versionada (`version: 1`), lista para migrarse cuando
  exista el diseñador visual. Impresión en hoja A4 en grilla (por defecto 60 × 35 mm, 21 por hoja).
- El servidor escucha solo en `127.0.0.1` (uso en una sola PC).

## Importación de listas de precios

- Formatos: Excel `.xlsx` y CSV (separado por `;` o `,`, en UTF-8 o Windows-1252). Los `.xls` antiguos
  hay que guardarlos antes como `.xlsx`. Hasta 20.000 filas y 10 MB.
- Flujo: archivo → asociación de columnas (sugerida automáticamente) → vista previa → confirmación.
  Hasta confirmar no se modifica nada.
- Identificación: código de barras; si la fila no lo trae, código interno. Nunca se duplican productos.
- Solo se registra un cambio de precio si el precio realmente cambió (importar dos veces el mismo
  archivo no genera nada nuevo).
- Las celdas vacías nunca borran datos. Por defecto solo se actualiza el precio y se completan datos vacíos;
  reemplazar nombre/marca/etc. es una opción explícita.
- Filas rechazadas (código inválido, precio ilegible, repetidas con precios distintos…) se informan con el
  motivo y se pueden descargar en CSV para corregirlas. No impiden importar el resto.
- Advertencias (variación de precio mayor al 50 %, precio cero, producto inactivo) no bloquean, pero se
  destacan antes de confirmar.
- Antes de aplicar se hace una copia de seguridad, y todo se aplica en una única transacción.

## Etiquetas e impresión

- Un único diseño compartido (`packages/shared/src/label-layout.ts`) calcula en milímetros dónde va cada
  elemento; la vista previa (SVG) y el PDF (PDFKit) solo lo dibujan, así lo que se ve es lo que se imprime.
  Los textos se miden con las métricas oficiales de Helvetica (`src/fonts/helvetica-metrics.ts`, generado con
  `node packages/shared/scripts/generate-helvetica-metrics.mjs`).
- Códigos de barras EAN-13, EAN-8 y UPC-A dibujados como vectores, con márgenes en blanco y módulo
  de 0,22–0,33 mm. Las pruebas los comparan barra por barra con bwip-js.
- Si el contenido no entra, se resigna en orden: marca/presentación → segundo renglón del nombre →
  código de barras, y se avisa.
- **Al imprimir, elegir «Tamaño real» / 100 %** (no «Ajustar a la página»). La primera hoja trae una regla
  de control de 100 mm.
- «Empezar en la posición» permite reutilizar hojas autoadhesivas ya usadas.
- Cada impresión guarda una copia de la plantilla y el precio impreso: se puede reimprimir igual aunque
  después cambien. Al imprimir, los productos quedan «Al día» (salvo en una impresión de prueba).
- Hoja de muestra para probar la impresora, sin tocar datos:

```bash
npm run labels:sample -w @etiquetas/server -- muestra.pdf
```

## Datos y copias de seguridad

- **Base de datos**: `%LOCALAPPDATA%\EtiquetasFarmacia\farmacia.db` (fuera de OneDrive a propósito:
  sincronizar un SQLite en uso puede corromperlo).
- **Copias**: carpeta `backups/` del proyecto (sí sincronizada por OneDrive = copia en la nube).
  Se hace una por día automáticamente (al iniciar y revisando cada hora), otra antes de cada importación
  y se puede hacer una a mano desde el Inicio («Hacer copia ahora»). Se conservan las últimas 30
  (`BACKUP_KEEP`). El Inicio avisa si la última copia tiene más de 2 días.
- **Restaurar una copia**: cerrá la aplicación, reemplazá `farmacia.db` por el archivo de copia elegido
  (renombrado a `farmacia.db`) y borrá `farmacia.db-wal` y `farmacia.db-shm` si existen.

## Plan por fases

1. ✅ Arquitectura, configuración, esquema y migraciones
2. ✅ Catálogo: CRUD de productos, tabla con búsqueda, filtros y paginación
3. ✅ Importación Excel/CSV con vista previa, validación e historial de precios
4. ✅ Etiquetas: plantilla, códigos de barras, vista previa y PDF
5. ✅ Dashboard completo, historial, manejo de errores, pruebas y mejoras de uso

Ideas para más adelante (no implementadas): diseñador visual de etiquetas (la configuración versionada
y el diseño en milímetros ya lo permiten), modo impresora de etiquetas (una por página), uso desde
varias PCs en la red local, integración con el sistema de gestión.
