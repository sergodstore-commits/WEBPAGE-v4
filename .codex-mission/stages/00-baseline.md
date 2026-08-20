# Stage 00-baseline — revalidar el V3 entregado

## Objetivo

Tratar toda la preimplementación como no confiable: instalar desde lockfile, inspeccionar el diff y la arquitectura contra CURRENT, verificar el entorno y corregir cualquier defecto local reproducible.

## Gates mínimos

- Node 24/npm 11 compatibles; `npm ci` sin mutar el lockfile.
- `npm run codex:prepare`, formato, lint y typecheck.
- Revisar las migraciones prospectivas sin modificar las 31 protegidas.
- Revisar secretos, permisos, adapters de pago y límites de alcance.
- Git limpio al cierre.

No aceptar PostgreSQL ni servicios externos sin evidencia real. Registrar `DEFERRED_EXTERNAL` y continuar con el trabajo independiente.
