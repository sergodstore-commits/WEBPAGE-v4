# 10 — Protocolo de ejecución Codex

## Sesión nueva

1. validar workspace y Git;
2. leer `INDEX.md` e `IMPLEMENTATION-STATUS.md`;
3. ejecutar `npm run codex:prepare`;
4. si `.codex-mission/STATE.json` existe, leer `MISSION.md`, reconciliar el estado y cargar solo el
   stage actual;
5. si `.codex-mission/` ya fue eliminada después del Release, trabajar desde Git,
   `IMPLEMENTATION-STATUS.md` y el mínimo CURRENT pertinente;
6. usar `codex-system/CONTEXT-ROUTING.json` como índice de contexto;
7. ejecutar.

## Autonomía

Codex opera PowerShell, npm, Git y herramientas disponibles directamente. Ante fallo local: inspeccionar → corregir → reintentar. No delegar comandos al usuario salvo que requieran credenciales/interacción humana no disponible al agente.

## Progressive disclosure

Mientras exista una misión activa, no leer intencionalmente stages futuros. Las Skills Sergod
repo-local viven en `.agents/skills/`. Skills externas solo se adquieren bajo demanda conforme a
`codex-system/EXTERNAL-SKILLS.json`. Usar un solo agente por defecto y aplicar las políticas de
eficiencia sin omitir gates.

## Checkpoints

Antes de cambios riesgosos, crear checkpoint/commit recuperable. Cada stage cerrado debe dejar Git coherente.

## Interrupciones

Si Git muestra trabajo que `STATE.json` no refleja durante una misión, o que
`IMPLEMENTATION-STATUS.md` no refleja después del Release:

- no reimplementar ciegamente;
- inspeccionar diff/commits;
- repetir gates del trabajo encontrado;
- reconciliar estado y continuar.

## Credenciales

No bloquear una misión por credenciales tempranas. Registrar deuda `DEFERRED_EXTERNAL` y resolverla
en la aceptación final. Después del Release no se conserva un runner temporal como autoridad: la
evidencia permanente vive en `IMPLEMENTATION-STATUS.md` y cualquier aceptación nueva debe usar un
procedimiento prospectivo, acotado y reproducible.

## Mutaciones remotas

- Staging: solo las mutaciones autorizadas por el stage y con limpieza/rollback definido.
- Producción: prohibida hasta Release; después del Release, solo mantenimiento autorizado, acotado,
  verificable y con rollback.
- Force push, reset destructivo, borrado de dominios/proyectos: prohibidos.

## Cierre

Después de Release y smoke tests verdes:

- consolidar `IMPLEMENTATION-STATUS.md`;
- eliminar `.codex-mission/`;
- eliminar helpers exclusivamente temporales de misión si el stage lo ordena;
- verificar de nuevo repo/gates/secret scan;
- commit final.
