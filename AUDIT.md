# AUDITORÍA — PLAN 2.0 / planificación semanal

## Estado actual de main

La referencia funcional es el planner semanal proporcionado: planificar antes de ejecutar, revisar el cumplimiento y cerrar la semana con reflexión.

| Área | Estado | Resultado |
|---|---|---|
| PLANIFICACIÓN SEMANAL | 🟢 | Vista principal dentro de Plan, con 7 días, emociones, tareas y selector de tareas. |
| Aislamiento semanal | 🟢 | Planificación, prioridades, balance y reflexión están ligados a la semana. |
| Planificación → Día | 🟢 | Las tareas son únicas y se ejecutan desde ambas vistas por fecha. |
| Selector de tareas | 🟢 | Matriz 3 filas × desplazamiento horizontal; diferencia disponible, seleccionada y completada. |
| Emociones | 🟢 | Excelente, Bien, Normal, Enojado, Agotado; se conserva “Bajo” para históricos. |
| NO NEGOCIABLES | 🟢 | Configurables y con ENTRENAMIENTO 1–4. |
| PRIORIDADES | 🟢 | Máximo 3 por semana; taskIds y priorityId se mantienen coherentes. |
| HÁBITOS | 🟢 | Días activos, cumplimiento semanal e historial. |
| BALANCE / REFLEXIÓN | 🟢 | Guardados por semana. |
| SEGUIMIENTO SEMANAL | 🟢 | Peso, pasos, estudio, sueño, sensación general y logro. |
| PROGRESO | 🟢 | Un día sin plan no se usa como 0; un día planificado con 0% sí cuenta. |
| INSIGHTS | 🟢 | Usa datos reales y señala cuando faltan datos; no afirma causalidad. |
| Sidebar / acciones | 🟢 | Frase antigua eliminada y acciones de sección sin posicionamiento absoluto. |
| PWA | 🟢 | Manifest, SVG válidos, service worker, caché offline e instalación. |
| Notificaciones | 🟡 | Locales y service worker; Web Push completo requiere backend/VAPID. |
| Sincronización | 🟡 | Multitab + endpoint REST opcional; no se afirma sync multi-dispositivo sin backend. |
| Responsive | 🟢 | Desktop/tablet/móvil; el plan semanal usa scroll horizontal contenido. |

## Correcciones conceptuales

1. Planificación semanal como centro del apartado Plan.
2. Datos semanales separados mediante weekKey/ensureWeek.
3. weekCompletion distingue sin planificación de 0% real.
4. Prioridades reparan la inconsistencia entre priorityId y taskIds.
5. PWA y notificaciones usan recursos SVG válidos.
6. Persistencia mantiene localStorage y normaliza a schema 3 con migración de claves legacy.

## Límites reales

No existe backend remoto en el repositorio:
- Web Push cerrado necesita backend/VAPID.
- Sync entre dispositivos necesita endpoint REST.
- La validación visual final en un teléfono físico depende de abrir la PWA en ese dispositivo; el código y workflows del repositorio sí fueron verificados.
