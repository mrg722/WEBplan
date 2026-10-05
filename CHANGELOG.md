# Changelog

## PLAN 2.0 — planificación semanal

- PLAN arranca en PLANIFICACIÓN SEMANAL.
- Planificación y Día comparten las mismas tareas por fecha.
- Datos semanales separados para planificación, prioridades, balance y reflexión.
- Selector de tareas 3 × 2 con desplazamiento horizontal.
- Estado emocional ENOJADO y compatibilidad con históricos BAJO.
- NO NEGOCIABLES con ENTRENAMIENTO 1–4.
- Cumplimiento semanal corregido para distinguir sin planificación de 0% real.
- Insights basados en métricas registradas, sin conclusiones artificiales.
- Acciones de sección estabilizadas.
- PWA offline actualizada: SVG válidos y notifications.js incluido en caché.
- Persistencia normalizada a schema 3.

## 1.1.0 — reparación y PWA

- Inicio vacío y fecha local actual.
- Corrección de claves de fecha y semanas.
- Sidebar con SVG.
- Tareas con fecha/hora y bandeja sin fecha.
- Prioridades, hábitos, no negociables, entrenamiento y metas.
- Cumplimiento, progreso e Insights revisados.
- Manifest PWA, service worker, caché e instalación.
- Notificaciones locales y preparación de Web Push.
- Sincronización entre pestañas y endpoint REST opcional.

## 1.0.0

- Primera implementación funcional sin dependencias externas.
## 2026-10-05 — Mobile atlas pass

- Added the provided colorful icon atlas as a reusable public asset.
- Added responsive mobile planner cards and fixed bottom navigation.
- Added explicit multi-day task creation with independent instances.
- Removed Unicode mood glyphs from the mood data model.

## 2026-10-05 — Final icon and interaction correction

- Consolidated visible UI icons into a single illustrated SVG system; no Unicode glyph is used as the visual control icon.
- Fixed the incorrect success icon shown in «¿Qué hago ahora?».
- Restored COSAS POR HACER and PLAN MÍNIMO · DÍAS DIFÍCILES in the day view.
- Restored explicit visual checked/unchecked states for weekly day planning and execution controls.
- Replaced free-text icon inputs for goals and non-negotiables with controlled icon choices while preserving legacy values.
- Fixed mobile overflow for the «Marcar completada» action and standardized edit/delete/navigation/add/save controls.
