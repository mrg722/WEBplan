# PLAN 2.0

**Organiza · Enfoca · Actúa · Logra**

PLAN 2.0 es un planner personal web/PWA inspirado en el planner semanal de referencia, convertido en una herramienta operativa y compacta.

## Incluye

- Día / Semana / Mes.
- Acordeones compactos en cada bloque.
- Planificación vacía desde cero: el usuario crea sus tareas, hábitos, prioridades, no negociables, entrenamientos y metas.
- Tareas con fecha, hora, duración, prioridad, notas, mover, completar y eliminar.
- Bandeja “Cosas por hacer” sin fecha, sin duplicar tareas.
- Estado emocional + energía opcional.
- Hábitos con frecuencia y días activos.
- No negociables manuales o ligados a agua/estudio/sueño/entrenamiento.
- Entrenamiento con duración, tipo, percepción y notas.
- Estudio, sueño, agua, pasos y peso.
- Plan mínimo para días difíciles.
- Balance diario y semanal.
- Meta → prioridad → tarea → completado mediante relaciones reales.
- “¿Qué hago ahora?” con reglas deterministas que consideran hora, prioridad, vencimiento y duración.
- Progreso histórico ligado a la semana seleccionada.
- Insights descriptivos que no declaran causalidad.
- Persistencia local con localStorage.
- Sincronización entre pestañas con BroadcastChannel/storage events.
- Exportar/importar respaldo JSON.
- Endpoint REST opcional para sincronización remota.
- PWA instalable con manifest + service worker + cache offline.
- Notificaciones locales con permiso del usuario + service worker.
- Service worker preparado para Web Push cuando exista un backend/VAPID.

## Ejecutar localmente

No requiere npm ni dependencias externas.

```bash
python server.py
```

Luego abre la URL indicada por el servidor, normalmente `http://localhost:4173`.

## GitHub Pages

El proyecto está preparado para servir desde una subruta como `/WEBplan/`. Los recursos usan rutas relativas y el service worker se registra con alcance relativo.

## Notificaciones

Las notificaciones locales avisan de tareas cercanas o vencidas mientras el sitio está activo y tiene permiso. El service worker también implementa el evento `push`, pero el envío push con la aplicación cerrada requiere un servidor Web Push y una suscripción con VAPID.

## Sincronización

Por defecto los datos viven en el navegador. La sincronización entre pestañas es automática. La sincronización entre dispositivos se puede conectar mediante un endpoint REST propio desde Configuración; el endpoint debe aceptar GET y PUT y devolver/recibir un objeto de datos PLAN 2.0.

## Android 8

PLAN 2.0 usa tecnologías PWA estándar y se degrada con comprobaciones de capacidad. El soporte principal recomendado es Android 10+; Android 8/9 quedaron con versiones antiguas de Chrome y deben considerarse compatibilidad legacy.
