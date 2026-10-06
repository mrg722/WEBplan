# Validación de PLAN 2.0

`npm run check` comprueba la sintaxis. `npm test` ejecuta las regresiones sin dependencias externas. Ambos comandos se ejecutan antes del despliegue de Pages.

## Navegador local

Inicia un servidor HTTP en la raíz del repositorio, puerto 4173. Con Playwright instalado, ejecuta `npm run test:mobile`. `PLAYWRIGHT_MODULE` puede apuntar a una instalación externa de Playwright y `TEST_SCREENSHOTS` a una carpeta de capturas fuera del repositorio. El script rechaza direcciones que no sean localhost.

La prueba utiliza perfiles temporales aislados: no toca los registros personales de la web publicada.

## Comprobado en esta entrega

- 35 pruebas Node: calendario local/DST, límites de semanas/meses/años, persistencia, migración, notas y energía cero, tareas independientes, recordatorios y caché PWA.
- Chrome local: vistas Planificar/Día/Semana/Mes a 320, 360, 375, 390, 412 y 430 px, más tablet de 768 y escritorio de 1280 px, sin desbordamiento horizontal global.
- Crear, completar, repetir hasta domingo, editar y quitar tareas; guardar día; guardar/abrir/eliminar notas; persistencia tras recarga y apertura offline real con service worker.
- Capturas locales inspeccionadas para planificación, Día y estados emocionales SVG sin recortes de atlas ni personas.

## Límites de la comprobación

Las pruebas responsive se ejecutaron en Chrome de escritorio con viewport móvil; no equivalen a una prueba física en Android 16 ni a todos los niveles de zoom del navegador. La referencia orienta la composición y los colores; no se certifica identidad píxel a píxel. La URL de producción tenía una restricción de permisos de navegación; el estado del despliegue se comprueba en GitHub Actions por separado.

Desde la versión de caché 8, al cargar la app se comprueba el worker y se recarga automáticamente la interfaz después de instalar el nuevo shell completo. `tests/updates.e2e.cjs` comprueba una actualización 8→9 con una sola recarga y conservación de localStorage. La migración inicial desde la versión 7 puede necesitar una segunda recarga porque el cliente antiguo no incluía el listener de actualización. No borrar el almacenamiento del sitio: contiene los datos personales.

Actualización del 6 de octubre: 37 pruebas Node; E2E ampliado con horas de sueño, elección de entrenamiento y recordatorio por fecha. Los recordatorios del cliente requieren permiso y la app activa; no existe un servidor push desplegado y no se garantiza la entrega con la app cerrada. No se accede a los datos personales del celular; la prueba de creatina usa un registro ficticio en un entorno aislado.

Si una regresión impide usar la app, revertir el commit de la entrega mediante Git (sin restablecer ni borrar los datos del navegador), incrementar la versión de caché de `sw.js`, ejecutar las pruebas y volver a desplegar.
