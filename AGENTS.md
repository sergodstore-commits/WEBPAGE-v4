# AGENTS.md — Sergod Store Web V1

## 1. Autoridad única

La única fuente normativa de requisitos funcionales, comerciales, de UX, arquitectura objetivo y alcance es `docs/CURRENT/`.

Jerarquía:

1. instrucción expresa actual del propietario;
2. `docs/CURRENT/` como conjunto coherente;
3. `AGENTS.md` para disciplina operativa;
4. `.codex-mission/STATE.json` + stage actual para secuencia temporal, solo mientras exista la misión;
5. `codex-system/` para eficiencia y disciplina operativa, nunca como autoridad de producto;
6. Skills Sergod repo-local en `.agents/skills/`;
7. Skills de terceros aprobadas;
8. código/migraciones/tests como evidencia del estado técnico, nunca como fuente para inventar alcance.

Una Skill de terceros jamás puede ampliar o contradecir CURRENT.

## 2. Lectura obligatoria

Al iniciar una sesión:

1. leer `README.md`;
2. leer `docs/CURRENT/INDEX.md`;
3. leer `docs/CURRENT/IMPLEMENTATION-STATUS.md`;
4. si `.codex-mission/STATE.json` existe, leer también `MISSION.md`, consultar
   `codex-system/CONTEXT-ROUTING.json` y cargar únicamente el stage actual y sus documentos CURRENT;
5. si `.codex-mission/` ya no existe, tratar la misión como finalizada y trabajar desde
   `IMPLEMENTATION-STATUS.md` más el mínimo CURRENT correspondiente al cambio solicitado;
6. ejecutar `npm run codex:prepare` si el índice de contexto falta o está desactualizado.

No cargar deliberadamente el contenido de stages futuros. Sus nombres pueden existir en la cola de estado, pero sus instrucciones se revelan progresivamente.

## 2.1 Skills y eficiencia

- Las Skills Sergod viven en `.agents/skills/` y son parte repo-local del workspace; no instalarlas globalmente.
- Aplicar `sergod-efficiency-governor` y `sergod-context-router` para trabajo sustancial.
- Una Skill externa solo puede adquirirse si `codex-system/EXTERNAL-SKILLS.json` la marca `APPROVED_ON_DEMAND` y el stage actual está permitido.
- No instalar Skills por anticipación. No autoactualizar Skills externas durante la misión.
- Un solo agente por defecto; `codex-system/AGENT-POLICY.md` gobierna las excepciones.

## 3. Prohibiciones de alcance

- No incorporar requisitos que no estén definidos por CURRENT.
- Código, tests o persistencia no autorizan por sí mismos una capacidad de producto.
- No implementar nodos futuros solo porque aparezcan en el árbol funcional.
- No modificar CURRENT para hacer que una implementación defectuosa “cumpla”. Si CURRENT es insuficiente o contradictorio, registrar la discrepancia y continuar únicamente con trabajo independiente.

## 4. Migraciones y datos

- Nunca editar, borrar, renumerar ni sustituir una migración potencialmente aplicada.
- Correcciones de esquema siempre mediante migraciones prospectivas.
- Probar tanto `upgrade` desde el baseline existente como `fresh install` 001→última.
- Toda prueba remota que escriba datos debe tener `acceptance_run_id`/correlación equivalente y limpieza verificable.
- Nunca hacer reset destructivo de producción.

## 5. Terminal y PowerShell

Codex debe ejecutar directamente los comandos que pueda ejecutar en el entorno, leer stdout/stderr, diagnosticar, corregir y reintentar. No debe pedir al usuario que copie errores de PowerShell si el agente puede operar la terminal.

Solo se difieren credenciales, MFA, CAPTCHA, altas de proveedores, decisiones comerciales nuevas y acciones externas realmente humanas.

## 6. Credenciales diferidas

La ausencia de una credencial no bloquea trabajo independiente. Registrar la capacidad como `DEFERRED_EXTERNAL` y continuar. No declarar PASS una integración no probada contra el entorno oficial cuando esa prueba sea requerida.

La intervención manual de credenciales se concentra en el stage final de aceptación externa.

## 7. Producción

Durante la misión se permiten local, mocks/fixtures, sandbox, staging y previews según el stage. No desplegar ni promover a producción hasta que CURRENT y el stage `RELEASE` lo autoricen expresamente y la aceptación externa final esté verde.

## 8. Git

- Mantener commits pequeños y recuperables por stage/substage.
- No force-push.
- No enlazar un remote hasta la fase indicada.
- Antes de una operación de alto impacto, crear checkpoint recuperable cuando corresponda.
- Si una sesión se interrumpe, reconciliar Git e `IMPLEMENTATION-STATUS.md`; incluir `STATE.json`
  únicamente mientras exista una misión activa.

## 9. Diseño

La autoridad visual es `docs/CURRENT/11-DISENO-E-IDENTIDAD-VISUAL.md` y `design/approved/`. `design/source-existing/` contiene fuentes visuales de trabajo y no implica aprobación de producción. El logo oficial es inmutable.

## 10. Finalización

Al completar la misión, `.codex-mission/` debe desaparecer físicamente del repositorio y su estado útil debe quedar consolidado en `docs/CURRENT/IMPLEMENTATION-STATUS.md` y Git.
