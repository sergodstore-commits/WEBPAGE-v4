# Session handoff mínimo

Al terminar una sesión significativa ejecutar `npm run codex:handoff`.

El archivo generado vive en `.runtime/codex/session-handoff.json` y contiene solo hechos recuperables: stage, HEAD, archivos cambiados, deferred y estado Git. No copiar razonamiento, conversaciones ni resúmenes extensos.

Al reanudar: comparar handoff con Git/STATE. Si no coinciden, confiar en Git + `STATE.json` y regenerar el handoff.
