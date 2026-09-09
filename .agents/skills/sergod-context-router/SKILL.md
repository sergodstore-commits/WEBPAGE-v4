---
name: sergod-context-router
description: Selecciona el contexto mínimo correcto para un stage o cambio de Sergod Store. Usar antes de explorar código, documentación, tests o dependencias para evitar cargar CURRENT completo o zonas no relacionadas.
---

# Sergod Context Router

1. Cargar `alwaysRead` desde `codex-system/CONTEXT-ROUTING.json`.
2. Si `.codex-mission/STATE.json` existe, obtener `currentStageId` y consultar el routing de ese stage.
3. Durante la misión, cargar el stage actual y solo los documentos CURRENT listados; después del
   release, cargar únicamente los documentos CURRENT pertinentes al cambio solicitado.
4. Buscar primero bajo `searchRoots`; ampliar fuera de ellos únicamente por una dependencia concreta, import, error o contrato.
5. No abrir stages futuros para obtener contexto mientras exista una misión activa.
6. Si un archivo no cambió y su hash ya está en `repo-index.json`, no releerlo sin una razón nueva.
