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


## Actualización responsive — 5 Oct 2026

- Se eliminó la dependencia visible de la barra lateral y del menú hamburguesa para la navegación principal.
- La navegación principal ahora se monta como barra inferior compacta: Plan, Metas, Progreso, Insights y Configura.
- En Plan existe una subbarra compacta con Planificar semana, Día, Semana y Mes.
- El plan semanal mantiene el scroll horizontal solamente dentro del planificador; se fuerza `overflow-x:hidden` en el documento para evitar una segunda barra horizontal de toda la página.
- Se añadió un editor de día dentro de Planificar semana para añadir, editar, completar o eliminar tareas del día seleccionado.
- Cada bloque principal del planificador tiene control Compactar/Expandir.
- Los estados emocionales del planificador dejaron de usar emojis y se renderizan como ilustraciones SVG coloreadas.
# Auditoría de la iteración móvil — 2026-10-05

## Hallazgos y cambios

- La arquitectura existente conserva `localStorage`, `schemaVersion: 3`, `weekKey()`, sincronización por `BroadcastChannel`, notificaciones, manifest y service worker.
- Se incorporó `public/icons/habits-atlas.png` como fuente visual real para navegación, estados y acciones; los estados emocionales ya no dependen de emojis Unicode.
- En móvil, PLAN 2.0 usa navegación inferior fija turquesa y la planificación semanal cambia a una cuadrícula propia de dos columnas; en 360 px o menos pasa a una columna para evitar overflow global.
- La creación de tareas permite seleccionar explícitamente varios días. Cada selección crea una instancia independiente y solo marca esos días de su `weekKey()` como planificados.

## Límites detectados

- El entorno no incluye `python` como comando, por lo que la validación usa `py -m py_compile` cuando está disponible.
- El snapshot descargado no trae credenciales Git configuradas para `push`; el commit local queda preparado, pero el envío a GitHub requiere una sesión/token de GitHub disponible en el entorno.


## Corrección de iconografía e interacciones — 2026-10-05

- Se consolidó la iconografía de interfaz en ilustraciones SVG internas para evitar la mezcla entre atlas raster, SVG anteriores y caracteres Unicode como iconos.
- Se corrigió el caso visual de «¿Qué hago ahora?» para que use un icono real de éxito/check y no una coordenada incorrecta del atlas.
- Los checks de tareas, hábitos, no negociables y planificación diaria ahora se representan con estados gráficos marcado/no marcado.
- Se restauraron en la vista Día las secciones COSAS POR HACER y PLAN MÍNIMO · DÍAS DIFÍCILES.
- Los selectores de icono de metas y no negociables dejaron de aceptar texto libre y usan tokens controlados, conservando compatibilidad con valores históricos.
- Las acciones de editar, eliminar, mover, cerrar, atrás/adelante, menú, agregar y guardar recibieron iconografía ilustrada y ajustes responsive.
- Se corrigió el desbordamiento del CTA «Marcar completada» en el bloque AHORA en móvil.
- La suite de calidad de GitHub Actions pasó correctamente en el commit final de esta iteración.
