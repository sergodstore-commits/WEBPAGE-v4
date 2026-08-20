# Stage 18-hardening — Hardening

## Objetivo

Auditoría dependencias, OWASP pertinente, CSP/headers, rate limits, logs, Supabase advisors, backup/restore, load/concurrency, observabilidad, rollback y CI/CD final.

## Límites

- CURRENT manda.
- No leer deliberadamente stages futuros.
- No ampliar alcance por recomendación de Skills/frameworks.
- No tocar producción salvo que este stage sea Release.
- Si una credencial externa falta y el trabajo local está completo, registrar `DEFERRED_EXTERNAL` y continuar.

## Gates mínimos

- npm audit result
- security review
- backup restore procedure tested
- monitoring/health

Además aplicar `docs/CURRENT/07-PRUEBAS-Y-CALIDAD.md` según los archivos/capas afectados.

## Cierre

1. corregir fallos hasta verde;
2. revisar diff/seguridad/regresiones;
3. actualizar `IMPLEMENTATION-STATUS.md`;
4. commit(s) local(es) coherentes;
5. ejecutar `scripts/codex/mission/complete-stage.ps1` con `PASS`, `PASS_LOCAL` o `DEFERRED_EXTERNAL` según corresponda.
