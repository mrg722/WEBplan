# PLAN 2.0

**Organiza · Enfoca · Actúa · Logra**

Planner personal web inspirado en el planner semanal de referencia y en la especificación funcional proporcionada.

## Qué contiene

- Vista Día / Semana / Mes.
- Acordeones para mantener la interfaz compacta.
- Estado emocional con 5 opciones y energía opcional.
- Agenda con tareas, hora, prioridad, notas, duración, edición, eliminación y movimiento a otro día.
- No negociables configurados desde datos persistentes.
- Hasta 3 prioridades semanales visibles.
- Bandeja de “Cosas por hacer” sin fecha.
- Habit tracker semanal.
- Entrenamientos simples (fecha, hora, duración, estado, tipo y notas).
- Estudio, sueño y agua.
- Plan mínimo para días difíciles.
- Balance diario y visión semanal.
- Metas a largo plazo y cadena Meta → Objetivo → Tarea → Completado.
- “¿Qué hago ahora?” basado en reglas simples, sin IA.
- Progreso e insights descriptivos sin afirmar causalidad.
- Persistencia con `localStorage`.
- Responsive / mobile-first.

## Ejecutar

```bash
npm install
npm run dev
```

Abrir la URL que muestre Vite.

Para validar producción:

```bash
npm run build
npm run preview
```

## Arquitectura

`src/types.ts` define el modelo de dominio; `src/data.ts` contiene datos de demostración; `src/utils.ts` concentra fechas y cálculos; `src/App.tsx` compone las vistas y operaciones; `src/styles.css` define el sistema visual responsive.

La capa actual de persistencia usa `localStorage`. El estado está normalizado alrededor de entidades separadas para que una futura API pueda reemplazarla sin rehacer la UI.
