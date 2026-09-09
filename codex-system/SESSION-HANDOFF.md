# Session handoff mínimo

Al terminar una sesión significativa ejecutar `npm run codex:handoff`.

El archivo generado vive en `.runtime/codex/session-handoff.json` y contiene solo hechos recuperables:
stage, HEAD, archivos cambiados, deferred y estado Git. Después del release registra estado
`COMPLETE` y stage nulo. No copiar razonamiento, conversaciones ni resúmenes extensos.

Al reanudar: comparar handoff con Git y, mientras exista, con `STATE.json`. Después del release,
confiar en Git + `docs/CURRENT/IMPLEMENTATION-STATUS.md` y regenerar el handoff.
