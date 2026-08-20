# Sergod Store V1 V4 — auditoría, aceptación externa y release

## Autoridad y punto de partida

`docs/CURRENT/` manda. El código preimplementado por Work es solamente un punto de partida: Codex debe inspeccionarlo, contrastarlo con CURRENT, corregirlo y ejecutar sus gates. Un test verde aislado no prueba conformidad funcional ni seguridad.

## Reglas invariantes

- No modificar las migraciones protegidas de `codex-system/MIGRATION-BASELINE.json`; cualquier cambio de datos usa una migración prospectiva nueva.
- Flow y Webpay siguen siendo adapters de Payments Core agnóstico. No integrar POS físico Transbank.
- `FREIGHT_COLLECT` cuesta 0 y no exige domicilio.
- Torneos son contenido editorial/informativo, nunca un gestor de rondas.
- Conservar las 8 Skills locales. Skills externas: solo ON-DEMAND, revisión de seguridad y commit fijado.
- No declarar PASS de PostgreSQL, proveedores, email, staging o producción sin evidencia real.

## Ciclo obligatorio por stage

`INSPECT → CURRENT CONFORMANCE → IMPLEMENT/FIX → TEST → SECURITY/DIFF REVIEW → EVIDENCE → COMMIT → COMPLETE`

Leer `STATE.json` y solo el stage actual. El trabajo independiente continúa aunque existan credenciales pendientes; se registra `DEFERRED_EXTERNAL` con precisión.

## Cierre

Antes de Release deben estar aceptados los proveedores y entornos externos, resueltos los hallazgos, actualizado `docs/CURRENT/IMPLEMENTATION-STATUS.md`, verificada la historia de migraciones y limpio Git. La misión solo se finaliza después de evidencia real de release.
