# AUDITORÍA — PLAN 2.0 v2

## Estado después de la corrección

| Área | Estado | Resultado |
|---|---|---|
| Diseño visual | 🟢 | Se mantiene el estilo pastel/limpio y se corrige el bug de SVG que convertía los iconos laterales en bloques negros. |
| Vista Día | 🟢 | Arranca en la fecha local actual, permite planificar desde cero y conserva los bloques pedidos. |
| Vista Semana | 🟢 | 7 días clicables, cumplimiento, tareas, hábitos, entrenamientos, estudio, sueño y balance. |
| Vista Mes | 🟢 | Calendario con cumplimiento, tareas, hábitos y entrenamiento; entra a cualquier día. |
| Tareas | 🟢 | CRUD, fecha/hora, prioridad, duración, notas, mover mañana y bandeja sin fecha separada. |
| Hábitos | 🟢 | CRUD, objetivo, frecuencia, días activos, matriz semanal y porcentaje de consistencia. |
| No negociables | 🟢 | CRUD, días activos, modo manual/métrica y cálculo por día. |
| Prioridades | 🟢 | Máximo 3 por semana y relación real con tareas; progreso automático cuando existen tareas asociadas. |
| Entrenamiento | 🟢 | Fecha, hora, duración, tipo, completado, percepción y notas. |
| Estudio / sueño / agua | 🟢 | Registro manual, objetivos y acumulación semanal. |
| Metas | 🟢 | Progreso derivado desde prioridades/tareas/hábitos y relaciones editables. |
| Progreso | 🟢 | La ventana de 4 semanas usa la semana seleccionada, no una fecha fija del sistema. |
| Insights | 🟢 | Basados en cumplimiento real y redactados como observaciones descriptivas. |
| Persistencia | 🟢 | localStorage v2, sin cargar la demo antigua. |
| PWA | 🟢 | Manifest, iconos, service worker, caché offline e instalación. |
| Notificaciones | 🟡 | Notificación local y service worker listos; push remoto requiere backend/VAPID. |
| Sincronización | 🟡 | Multitab + import/export + endpoint REST configurable. Sync entre dispositivos requiere conectar un backend. |
| Android 8 | 🟡 | Compatibilidad legacy por limitaciones del navegador antiguo; soporte principal recomendado Android 10+. |

## Correcciones específicas realizadas

### 1. Sidebar
El SVG no tenía `fill:none` / `stroke:currentColor`. Los paths se rellenaban con el valor por defecto del SVG y aparecían como cuadrados/círculos negros. Se añadió un sistema común de iconos SVG.

### 2. Botones “Nueva tarea”
La acción estaba posicionada encima del resumen del acordeón. Se reservó espacio real en la cabecera y se ajustó la posición en desktop y móvil.

### 3. Datos iniciales
La aplicación ya no arranca con la demo del planner. La clave de almacenamiento cambió a `plan20-data-v2`, por lo que la demo anterior no se reutiliza.

### 4. Fecha local
Se eliminó el uso de `toISOString().slice(0,10)` para las claves de día. Las fechas se generan en calendario local, evitando saltos de fecha por UTC.

### 5. Tareas sin fecha
Una tarea puede permanecer realmente en “Cosas por hacer”. El editor tiene la opción explícita “Guardar sin fecha”.

### 6. ¿Qué hago ahora?
Ahora considera prioridad, vencimiento, proximidad horaria y duración antes de elegir la siguiente acción.

### 7. Relaciones
Prioridades y metas pueden relacionarse a tareas. El progreso de una prioridad o meta se recalcula desde sus relaciones cuando estas existen.

### 8. Progreso
Ya no está atado siempre a `new Date()`; usa la semana actualmente seleccionada.

### 9. Insights
Se quitó la puntuación arbitraria basada en agua/estudio/mood. Las observaciones usan `dayCompletion()` y muestran explícitamente el carácter descriptivo.

### 10. PWA
Se añadió manifest, iconos y service worker con cache offline, `push` y `notificationclick`.

### 11. Notificaciones
Se añadió permiso explícito, notificación de prueba y recordatorios de tareas cercanas/vencidas mediante el service worker.

### 12. Sincronización
Se añadió sincronización multitab y una interfaz para endpoint REST remoto, además de backup/import.

## Límites honestos

No existe un backend remoto dentro de GitHub Pages. Por eso el producto no puede inventar una sincronización entre teléfonos ni enviar Web Push desde un servidor inexistente. El frontend queda preparado para conectarlo sin rehacer la UI.
