---
name: sergod-efficiency-governor
description: Gobierna el uso eficiente de contexto, créditos, tests y comandos en Sergod Store. Usar al iniciar cada stage, ante tareas amplias o cuando exista riesgo de releer archivos, ejecutar suites completas innecesariamente o crear subagentes.
---

# Sergod Efficiency Governor

1. Leer `codex-system/EFFICIENCY-POLICY.md` y el routing del stage actual.
2. Ejecutar `npm run codex:index` si el índice falta o el HEAD/cambios relevantes cambiaron.
3. Localizar con `rg`, imports y el índice antes de abrir archivos completos.
4. Mantener el contexto en el mínimo conjunto que permita decidir con seguridad.
5. Ejecutar tests afectados primero; ampliar solo por fallo, dependencia o gate.
6. Preferir scripts deterministas a repetir análisis manual.
7. Mantener reportes intermedios compactos.
8. Aplicar `codex-system/AGENT-POLICY.md`; un solo agente es el default.
9. Nunca ahorrar omitiendo gates, seguridad, authz, idempotencia o migraciones.
