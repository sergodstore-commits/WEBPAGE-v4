# 10 — Protocolo de ejecución Codex

## Sesión nueva

1. validar workspace y Git;
2. leer `INDEX.md`, `MISSION.md` y `STATE.json`;
3. ejecutar `npm run codex:prepare`;
4. usar `codex-system/CONTEXT-ROUTING.json` para cargar solo CURRENT pertinente;
5. reconciliar `STATE.json`, Git e `IMPLEMENTATION-STATUS.md` si hubo interrupción;
6. cargar solo stage actual;
7. ejecutar.

## Autonomía

Codex opera PowerShell, npm, Git y herramientas disponibles directamente. Ante fallo local: inspeccionar → corregir → reintentar. No delegar comandos al usuario salvo que requieran credenciales/interacción humana no disponible al agente.

## Progressive disclosure

No leer intencionalmente stages futuros. Las Skills Sergod repo-local viven en `.agents/skills/`. Skills externas solo se adquieren bajo demanda conforme a `codex-system/EXTERNAL-SKILLS.json`. Usar un solo agente por defecto y aplicar las políticas de eficiencia sin omitir gates.

## Checkpoints

Antes de cambios riesgosos, crear checkpoint/commit recuperable. Cada stage cerrado debe dejar Git coherente.

## Interrupciones

Si Git muestra trabajo que `STATE.json` no refleja:

- no reimplementar ciegamente;
- inspeccionar diff/commits;
- repetir gates del trabajo encontrado;
- reconciliar estado y continuar.

## Credenciales

No bloquear la misión por credenciales tempranas. Registrar deuda `DEFERRED_EXTERNAL`. Al final, Codex entrega **un único comando PowerShell**: `scripts/codex/FINAL-EXTERNAL-ACCEPTANCE.ps1`. El usuario introduce lo necesario una sola vez; el resto vuelve a ser responsabilidad de Codex.

## Mutaciones remotas

- Staging: solo las mutaciones autorizadas por el stage y con limpieza/rollback definido.
- Producción: prohibida hasta Release.
- Force push, reset destructivo, borrado de dominios/proyectos: prohibidos.

## Cierre

Después de Release y smoke tests verdes:

- consolidar `IMPLEMENTATION-STATUS.md`;
- eliminar `.codex-mission/`;
- eliminar helpers exclusivamente temporales de misión si el stage lo ordena;
- verificar de nuevo repo/gates/secret scan;
- commit final.
