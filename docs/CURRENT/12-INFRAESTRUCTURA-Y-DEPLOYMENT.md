# 12 — Infraestructura y deployment

## Topología objetivo

```text
Usuario
 ├─ Vercel → apps/web (React/Vite)
 └─ Render Free → apps/api (Node HTTP)
               ↑
        Supabase Cron → rutas internas autenticadas
               ├─ promotion lifecycle
               ├─ preorder lifecycle
               ├─ cart expiration
               └─ order expiration
                    ↓
                 Supabase
          PostgreSQL / Auth / Storage
```

## Local

PostgreSQL portable de `scripts/postgres/` es el mecanismo principal en Windows. Docker es opcional y solo se exige si una tarea realmente necesita Supabase local completo u otro entorno contenerizado.

## Staging

- Supabase actual = staging/integration.
- Vercel Preview para frontend.
- Render staging/preview equivalente para API antes de producción.
- Flow/Webpay sandbox/integración para aceptación.

## Producción

- Supabase PROD limpio creado en Release.
- Vercel producción para web y dominios.
- Render Free producción para API.
- Supabase Cron para lifecycle/expiration, según la decisión expresa del propietario de mantener costo fijo mensual de hosting en cero.
- secretos configurados en los stores de cada plataforma.

## Jobs

Cada job debe ser idempotente/durable conforme a su contexto y tener observabilidad. No dejar lifecycle/expiración dependiente de ejecución manual en producción. Supabase Cron invoca rutas internas separadas de la API cada cinco minutos; un secreto de alta entropía almacenado fuera de Git autentica esas llamadas.

La modalidad gratuita no ofrece SLA, backups automáticos ni garantía de ausencia de suspensión. Estas limitaciones se registran de forma explícita y nunca se presentan como equivalentes operativos a un plan pago.

## CI/CD

GitHub Actions debe verificar los gates definidos para PR/commit cuando el remoto operativo quede configurado. La promoción a producción no se realiza solo porque CI esté verde: también requiere Final External Acceptance y autorización del stage Release.

## Rollback

Antes de producción debe existir:

- rollback de deploy;
- estrategia para migraciones prospectivas;
- backup/restore probado;
- capacidad de volver a versión previa de API/web sin reescribir historia de DB.
