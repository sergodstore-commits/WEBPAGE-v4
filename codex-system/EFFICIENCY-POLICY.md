# Política de eficiencia Codex

Objetivo: minimizar créditos, contexto y tiempo **sin reducir** seguridad, corrección ni gates.

1. Leer `AGENTS.md`, `docs/CURRENT/INDEX.md` e `IMPLEMENTATION-STATUS.md`. Si existe
   `.codex-mission/STATE.json`, añadir el stage actual y los documentos que
   `CONTEXT-ROUTING.json` le asigne; después del release, cargar solo el CURRENT pertinente al cambio.
2. Usar `rg`, símbolos, imports y `repo-index.json` para localizar antes de abrir archivos completos.
3. No releer archivos cuyo hash no cambió salvo que un fallo obligue a ampliar contexto.
4. Ejecutar primero tests afectados; ampliar a contexto/suite completa únicamente por dependencia, fallo o gate del stage.
5. Preferir scripts deterministas para inventario, hashes, Git, migraciones y validaciones repetitivas.
6. No investigar frameworks, proveedores o patrones externos salvo que el stage necesite información vigente para implementar un contrato real.
7. Mantener salidas intermedias compactas: estado, evidencia, fallo y siguiente acción. Evitar narraciones de trabajo ya visible en logs.
8. No crear planes paralelos a la misión salvo que el stage sea demasiado grande; si ocurre, guardar el plan temporal bajo `.runtime/codex/`.
9. No usar subagentes para tareas rutinarias. Aplicar `AGENT-POLICY.md`.
10. No instalar Skills externas por anticipación. Aplicar `EXTERNAL-SKILLS.json`.
11. Antes de cerrar sesión, actualizar el handoff mínimo con `npm run codex:handoff`.
12. El ahorro nunca autoriza omitir authz, idempotencia, migraciones, seguridad, pruebas o aceptación requerida.
