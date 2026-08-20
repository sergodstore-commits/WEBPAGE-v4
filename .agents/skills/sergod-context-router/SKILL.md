---
name: sergod-context-router
description: Selecciona el contexto mínimo correcto para un stage o cambio de Sergod Store. Usar antes de explorar código, documentación, tests o dependencias para evitar cargar CURRENT completo o zonas no relacionadas.
---

# Sergod Context Router

1. Leer `STATE.json` y obtener `currentStageId`.
2. Consultar `codex-system/CONTEXT-ROUTING.json` para ese stage.
3. Cargar `alwaysRead`, el stage actual y solo los documentos CURRENT listados.
4. Buscar primero bajo `searchRoots`; ampliar fuera de ellos únicamente por una dependencia concreta, import, error o contrato.
5. No abrir stages futuros para obtener contexto.
6. Si un archivo no cambió y su hash ya está en `repo-index.json`, no releerlo sin una razón nueva.
