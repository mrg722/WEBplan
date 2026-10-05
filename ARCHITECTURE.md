# Arquitectura limpia de PLAN 2.0

## 1. Capa de presentación

`index.html` es el punto de entrada mínimo. `src/app.js` compone la interfaz mediante funciones de render independientes: Día, Semana, Mes, Metas, Progreso, Insights, Configuración y modales.

La UI utiliza atributos `data-action`, de modo que la interacción se mantiene centralizada en delegación de eventos y no depende de una librería externa.

## 2. Capa de dominio / cálculos

`src/utils.js` contiene operaciones puras para fechas, semanas, porcentajes, horas, escape de texto y cálculos repetibles. Esto evita mezclar lógica de fechas dentro de cada tarjeta.

## 3. Estado y persistencia

`src/store.js` es la frontera de persistencia. Hoy usa `localStorage`, pero las vistas no necesitan conocer cómo se guarda la información.

`src/data.js` contiene el dataset inicial de demostración.

## 4. Modelo

Las entidades principales son:

- `tasks`: tareas con fecha, hora, prioridad, duración, estado y notas.
- `nonNegotiables`: acuerdos personales configurables.
- `habits`: seguimiento diario por fecha.
- `priorities`: máximo 3 prioridades activas de la semana.
- `training`: registros simples de entrenamiento.
- `goals`: metas de largo plazo con referencias a prioridades/tareas/hábitos.
- `days`: registro diario de emoción, energía, estudio, sueño, agua, pasos, peso, reflexión y plan mínimo.
- `weekly`: balance de la semana.
- `settings`: objetivos que alimentan los indicadores.

## 5. Regla de “¿Qué hago ahora?”

No usa IA. Selecciona la primera tarea pendiente del día ordenada por hora y, si no existe, toma una pendiente sin fecha. La decisión es simple, transparente y predecible.

## 6. Futuro backend

Para migrar a backend:

1. Mantener los mismos objetos de dominio.
2. Reemplazar `load/save` por cliente API.
3. Agregar autenticación y un `userId` a las entidades.
4. Persistir relaciones Meta → Prioridad → Tarea → Completado y Meta → Hábito.
5. Añadir validaciones de servidor.

## 7. Principios UX

La pantalla prioriza `ABRIR → VER → HACER → MARCAR → CONTINUAR`. Las tarjetas se pueden plegar y muestran un resumen al cerrarse. Día es la vista operativa; Semana y Mes son para revisión y contexto; Progreso e Insights son para mirar hacia atrás.
