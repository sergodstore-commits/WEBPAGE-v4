# Stage 20-release — Release controlado

## Objetivo

Crear/configurar Supabase PROD limpio, GitHub remoto operativo, Render/Vercel de producción, migraciones fresh, bootstrap ADMIN, datos reales aprobados, smoke tests y rollback usando las sesiones/secret stores preparados en Final External Acceptance, sin pedir otra ronda manual de credenciales salvo imposibilidad técnica real.

## Límites

- CURRENT manda.
- No leer deliberadamente stages futuros.
- No ampliar alcance por recomendación de Skills/frameworks.
- No tocar producción salvo que este stage sea Release.
- Si una credencial externa falta y el trabajo local está completo, registrar `DEFERRED_EXTERNAL` y continuar.

## Gates mínimos

- production smoke PASS
- fresh install PROD
- domains healthy
- rollback documented
- mission finalization

Además aplicar `docs/CURRENT/07-PRUEBAS-Y-CALIDAD.md` según los archivos/capas afectados.

## Cierre

1. corregir fallos hasta verde;
2. revisar diff/seguridad/regresiones;
3. actualizar `IMPLEMENTATION-STATUS.md`;
4. commit(s) local(es) coherentes;
5. ejecutar `scripts/codex/mission/complete-stage.ps1` con `PASS`, `PASS_LOCAL` o `DEFERRED_EXTERNAL` según corresponda.
