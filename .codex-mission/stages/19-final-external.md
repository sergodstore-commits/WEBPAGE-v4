# Stage 19-final-external — Aceptación externa final agrupada

## Objetivo

No pedir credenciales antes. Preparar/usar FINAL-EXTERNAL-ACCEPTANCE.ps1 y entregar al usuario un único comando. Validar Supabase staging, ADMIN, Flow sandbox, Webpay integration, email provider, Vercel Preview, Render staging y E2E remoto. Resolver toda deuda deferred. El procedimiento debe además dejar listas sesiones CLI/secret stores no-Git que Release necesite, para evitar pedir al usuario una segunda ronda de credenciales.

## Límites

- CURRENT manda.
- No leer deliberadamente stages futuros.
- No ampliar alcance por recomendación de Skills/frameworks.
- No tocar producción salvo que este stage sea Release.
- Si una credencial externa falta y el trabajo local está completo, registrar `DEFERRED_EXTERNAL` y continuar.

## Gates mínimos

- all deferred resolved or explicit owner decision
- no secrets persisted
- temporary acceptance data cleaned

Además aplicar `docs/CURRENT/07-PRUEBAS-Y-CALIDAD.md` según los archivos/capas afectados.

## Cierre

1. corregir fallos hasta verde;
2. revisar diff/seguridad/regresiones;
3. actualizar `IMPLEMENTATION-STATUS.md`;
4. commit(s) local(es) coherentes;
5. ejecutar `scripts/codex/mission/complete-stage.ps1` con `PASS`, `PASS_LOCAL` o `DEFERRED_EXTERNAL` según corresponda.
