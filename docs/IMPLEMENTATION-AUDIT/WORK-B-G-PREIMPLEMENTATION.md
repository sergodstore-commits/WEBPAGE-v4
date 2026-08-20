# Registro histórico de preimplementación Work B–G

> Este documento describe el punto de partida de V2. No expresa pendientes actuales; para el estado verificable de V4 manda `docs/CURRENT/IMPLEMENTATION-STATUS.md`.

## Propósito

Work implementó un punto de partida sustancial para Payments, proveedores, Fulfillment, Account/Admin, comercio/editorial, diseño, notificaciones y hardening. Este documento facilita la auditoría; no certifica aceptación.

## Decisiones preservadas

- Payments Core es agnóstico; Flow y Webpay Plus son adapters REST.
- No existe integración de POS físico Transbank.
- La confirmación del navegador nunca es autoritativa: el servidor consulta al proveedor y aplica idempotencia.
- `FREIGHT_COLLECT` vale 0 y no exige domicilio.
- Torneos se modelan como contenido editorial, sin rondas, brackets o inscripción competitiva.
- Las migraciones posteriores al baseline son prospectivas y no alteran las 31 migraciones protegidas.

## Riesgos históricos y estado V4

1. Migraciones completas y tests de integración sobre PostgreSQL real: ejecutados localmente en V4.
2. Verificar firmas, estados, montos, moneda, referencias, duplicados y pagos tardíos contra sandboxes oficiales.
3. Revisar RLS, autorización por cuenta/rol y exposición de PII en logs/respuestas.
4. Adapter, worker e idempotencia de email: implementados localmente; entrega oficial sigue externa.
5. Probar UI, accesibilidad, responsive y flujos de error contra staging.
6. No confiar en conteos o PASS históricos: repetir gates y corregir divergencias con CURRENT.

## Evidencia Work

Los resultados exactos y limitaciones están en `docs/CURRENT/IMPLEMENTATION-STATUS.md`; la misión V4 separa verificación local, proveedores, staging, E2E remoto, aceptación final y Release.
