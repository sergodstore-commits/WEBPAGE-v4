# Sergod Store Web V1

Repositorio operativo de **Sergod Store Web V1**.

## Autoridad

La especificación normativa única está en `docs/CURRENT/`. Comienza por `docs/CURRENT/INDEX.md`.

Cada capacidad implementada debe estar respaldada por CURRENT. Código, contratos, tests y persistencia describen el estado técnico; no amplían el producto por sí solos.

## Inicio con Codex

1. Abrir únicamente esta carpeta como workspace.
2. Abrir `INICIO-CODEX.txt` y entregarlo completo como primer mensaje.
3. Codex lee `AGENTS.md`, `docs/CURRENT/INDEX.md` y `docs/CURRENT/IMPLEMENTATION-STATUS.md`.
4. Si existe `.codex-mission/`, Codex lee únicamente el stage actual; su ausencia después del release
   significa que la misión terminó y no es un archivo faltante.
5. Codex prepara por sí mismo dependencias, terminal, Git, Skills y verificaciones según las instrucciones del workspace.

## Seguridad

- No se versionan `.env` ni credenciales reales.
- Git comienza sin remote operativo.
- Supabase de integración es **STAGING/INTEGRATION**.
- Producción se crea y valida durante Release.

## Desarrollo local

Usar Node 24 y npm 11 según `package.json`. En Windows, `scripts/postgres/` prepara PostgreSQL portable sin exigir Docker.

Los helpers de `scripts/codex/` permiten que Codex opere terminal, PowerShell y gates directamente.

## Codex eficiente

El workspace incluye Skills repo-local en `.agents/skills/` y políticas deterministas en `codex-system/`. Un Codex nuevo debe comenzar por `AGENTS.md`; `npm run codex:prepare` valida el sistema y crea el índice local de contexto sin usar red. Skills externas no se instalan por defecto.
