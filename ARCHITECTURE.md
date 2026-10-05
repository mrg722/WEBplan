# Arquitectura PLAN 2.0 v2

## Presentación

`index.html` es el punto de entrada. `src/app.js` mantiene el estado de la SPA, renderiza Día/Semana/Mes y centraliza eventos. `src/styles.css` contiene el sistema visual responsive.

## Dominio

Las entidades están separadas:

- tareas
- no negociables
- prioridades
- hábitos
- entrenamiento
- metas
- registros diarios
- balances semanales
- configuración
- notificaciones
- sincronización

Las relaciones importantes se guardan por IDs:

`meta → prioridades/tareas/hábitos`

`prioridad → tareas`

`tarea → prioridad/meta`

## Persistencia

`src/store.js` normaliza los datos y persiste en `localStorage` con la clave `plan20-data-v2`. La aplicación no carga la antigua demo v1.

También existe sincronización de la misma aplicación entre pestañas con `BroadcastChannel` y el evento `storage`.

## Cálculos

`src/utils.js` concentra fechas locales, semana ISO, formato de fechas, porcentajes y minutos.

`app.js` calcula cumplimiento, progreso de prioridades/metas, métricas semanales y observaciones descriptivas.

## ¿Qué hago ahora?

El selector prioriza:

1. tareas pendientes del día;
2. prioridad alta/media/baja;
3. tareas vencidas si hoy corresponde;
4. cercanía temporal;
5. duración corta como desempate.

No usa IA.

## PWA

- `manifest.webmanifest`
- `sw.js`
- iconos PNG/SVG
- caché offline
- `beforeinstallprompt`
- `push`
- `notificationclick`

## Notificaciones

Hay dos capas:

**Local:** el cliente revisa las tareas y usa `ServiceWorkerRegistration.showNotification()` cuando la app está ejecutándose y el usuario concedió permiso.

**Web Push:** el service worker acepta eventos `push`. Falta únicamente conectar un backend que almacene PushSubscriptions y envíe mensajes con VAPID.

## Sincronización remota

La UI acepta un endpoint REST configurable:

- GET: puede devolver `{data: {...}, updatedAt: "..."}` o directamente el objeto de datos.
- PUT: recibe `{data: {...}, updatedAt: "..."}`.

El cliente compara `meta.updatedAt` y usa la versión remota más nueva. Sin endpoint, no hay sincronización externa.

## Seguridad y privacidad

- escape de contenido antes de insertar texto dinámico;
- no se usan secretos en el frontend;
- token de sincronización, si se configura, queda localmente en el navegador;
- no se envían datos a terceros por defecto;
- notificaciones requieren permiso explícito.
