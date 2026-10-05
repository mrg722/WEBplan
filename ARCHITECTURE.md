# Arquitectura PLAN 2.0

## Presentación

index.html es el punto de entrada. src/app.js mantiene el estado de la SPA y renderiza PLANIFICACIÓN SEMANAL, Día, Semana, Mes, Metas, Progreso, Insights y Configuración. src/styles.css contiene el sistema visual responsive.

## Flujo principal

PLANIFICACIÓN SEMANAL → EJECUCIÓN DIARIA → SEGUIMIENTO → PROGRESO → REFLEXIÓN

La planificación semanal es la fuente de la ejecución. Las tareas siguen siendo una sola entidad; su fecha las ubica en el día y la semana correspondiente.

## Dominio

Las entidades principales son tareas, no negociables, prioridades, hábitos, entrenamiento, metas, registros diarios, datos semanales, configuración, notificaciones y sincronización.

Relaciones principales:
meta → prioridades/tareas/hábitos
prioridad → tareas
tarea → prioridad/meta

La consistencia de prioridad se repara al cargar y al guardar.

## Datos y persistencia

src/data.js define schema 3.

src/store.js:
- normaliza datos;
- mantiene localStorage;
- migra claves legacy detectadas;
- crea datos semanales con ensureWeek;
- guarda planificación, balance y reflexión por weekKey;
- sincroniza pestañas con BroadcastChannel y storage.

No existe backend por defecto.

## Cálculos

src/utils.js centraliza claves de fecha locales, semanas, porcentajes, formatos y estados de ánimo.

app.js calcula cumplimiento diario, cumplimiento semanal sobre días planificados, progreso de prioridades/metas, métricas semanales e Insights descriptivos.

## PWA

manifest.webmanifest
sw.js
iconos SVG en public/icons
caché offline
beforeinstallprompt
push
notificationclick

El service worker incluye src/notifications.js en su shell offline y usa una caché versionada.

## Notificaciones

Las notificaciones locales revisan tareas mientras la app está activa y requieren permiso del usuario. El service worker también procesa eventos push.

Web Push con la app cerrada requiere un backend que almacene suscripciones y use VAPID. No se inventa ese backend dentro de este repo.

## Sincronización remota

Configuración permite un endpoint REST opcional:
GET para consultar la versión remota.
PUT para subir data y updatedAt.

Sin endpoint, PLAN 2.0 funciona completamente de forma local.

## Seguridad y privacidad

- valores dinámicos escapados antes de renderizar;
- sin secretos de backend en el frontend;
- token de sync, si existe, queda localmente en el navegador;
- sin envíos externos por defecto;
- notificaciones con permiso explícito.
