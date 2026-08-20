# 12 — Infraestructura y deployment

## Topología objetivo

```text
Usuario
 ├─ Vercel → apps/web (React/Vite)
 └─ Render → apps/api (Node persistente)
               ├─ Render Cron → promotion lifecycle
               ├─ Render Cron → preorder lifecycle
               └─ Render Cron → cart expiration / jobs futuros necesarios
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
- Render producción para API/jobs.
- secretos configurados en los stores de cada plataforma.

## Jobs

Cada job debe ser idempotente/durable conforme a su contexto y tener observabilidad. No dejar lifecycle/expiración dependiente de ejecución manual en producción.

## CI/CD

GitHub Actions debe verificar los gates definidos para PR/commit cuando el remoto operativo quede configurado. La promoción a producción no se realiza solo porque CI esté verde: también requiere Final External Acceptance y autorización del stage Release.

## Rollback

Antes de producción debe existir:

- rollback de deploy;
- estrategia para migraciones prospectivas;
- backup/restore probado;
- capacidad de volver a versión previa de API/web sin reescribir historia de DB.
