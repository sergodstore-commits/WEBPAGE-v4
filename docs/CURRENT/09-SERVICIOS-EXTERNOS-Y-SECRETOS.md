# 09 — Servicios externos y secretos

## Regla general

Ningún secreto vive en Git, documentación, prompts, manifests ni logs. `.env.example` contiene nombres/contrato, nunca valores privados.

## Supabase

El proyecto actualmente conocido se clasifica como STAGING/INTEGRATION. Sus identificadores no secretos pueden vivir en `ops/project-targets.json`.

Producción será un proyecto separado creado al final. No resetear ni borrar staging durante la misión.

## Vercel

Destino del frontend. Usar Preview para aceptación previa. Los dominios productivos solo se promueven en Release.

## Render

Destino objetivo de `apps/api` y cron jobs. El recurso definitivo puede no existir al inicio; crearlo/configurarlo durante la fase de deployment siguiendo CURRENT, no antes.

## Flow / Webpay Plus

Credenciales se mantienen fuera del repo. Implementación local/contractual puede avanzar sin ellas. Sandbox oficial se valida en Final External Acceptance.

## ADMIN

Cuenta y contraseña no se copian al repositorio. Tokens de sesión son efímeros; cuando se necesiten se obtienen en runtime y se guardan solo bajo `.runtime/`.

## Email

V1 exige email transaccional; el proveedor concreto se selecciona/verifica en el stage Notifications sin convertir la elección en dependencia del dominio.

## Credenciales diferidas

Estados permitidos:

- `PASS` — comportamiento e integración requerida verificados.
- `PASS_LOCAL` — stage local deliberadamente completo.
- `DEFERRED_EXTERNAL` — implementación local completa, validación oficial pendiente por credencial/acceso.
- `FAIL` — problema real de código/contrato; no cerrar stage.

La misión no debe detenerse por `DEFERRED_EXTERNAL` si existen etapas independientes.
