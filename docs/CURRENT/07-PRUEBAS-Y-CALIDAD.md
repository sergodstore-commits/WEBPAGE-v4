# 07 — Pruebas y calidad

## Gates locales base

Un cambio debe ejecutar la combinación pertinente de:

- `npm run format:check`
- `npm run lint`
- `npm run typecheck`
- `npm run test:unit`
- `npm run test:application`
- `npm run test:contract`
- `npm run test:web`
- `npm run test:integration:local`
- `npm run build`

No declarar PASS por pruebas no ejecutadas.

## Capas de prueba

- Unit: invariantes puras.
- Application: actor, autorización, entradas, resultados, transacciones declaradas e idempotencia.
- Integration: PostgreSQL real para constraints, locking, rollback y migraciones.
- Contract: proveedores externos mediante fixtures/mocks contractuales.
- External acceptance: sandbox/entorno oficial cuando una integración lo requiere.
- E2E: recorridos reales del sistema completo.
- Visual QA: desktop/móvil, accesibilidad y regresión visual.

## Definition of Done por stage

- alcance del stage satisfecho sin ampliar producto;
- errores y excepciones cubiertos;
- autorización del lado servidor;
- idempotencia/transacción correctas cuando corresponde;
- tests nuevos/actualizados;
- gates pertinentes verdes;
- diff revisado;
- no secretos;
- no TODO obligatorio disfrazado de implementación;
- documentación de estado actualizada;
- rollback/checkpoint razonable para cambios de riesgo.

## Migraciones

Siempre upgrade + fresh install cuando el stage modifica esquema.

## Proveedores externos

Mocks no sustituyen aceptación oficial. Si falta credencial, registrar `DEFERRED_EXTERNAL`; continuar con trabajo independiente y resolver todo en Final External Acceptance.

## Seguridad final

Antes de Release: auditoría de dependencias, revisión OWASP pertinente, Supabase security/advisors, headers/CSP, privacidad de logs, backup/restore, pruebas de concurrencia y smoke tests.
