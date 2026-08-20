# Stage 03-staging — despliegue seguro en staging

## Objetivo

Desplegar únicamente cuando exista un destino autorizado. Aplicar migraciones prospectivas, configurar secretos, observabilidad y rollback; ejecutar smoke sobre el entorno real.

## Evidencia exigida

- Migraciones y RLS verificadas en PostgreSQL administrado.
- Health, catálogo, editorial, cuenta, admin y callbacks accesibles según rol.
- CORS, headers, timeouts, logs y recuperación comprobados.
- Rollback practicable y sin pérdida de datos.
