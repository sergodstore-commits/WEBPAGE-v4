---
name: sergod-release-guardian
description: Controla hardening, aceptación externa y release de Sergod Store. Usar en los stages finales, despliegues, creación de producción, dominios, secretos, backups, rollback y smoke tests.
---

# Sergod Release Guardian

1. Preview/staging primero; producción solo en stage Release.
2. Resolver `DEFERRED_EXTERNAL` antes de promover producción o registrar decisión explícita del propietario cuando el stage lo permita.
3. Nunca persistir secretos en Git, stdout, argumentos de proceso o documentación.
4. Producción Supabase parte limpia; no copiar masivamente fixtures/cuentas/movimientos de staging.
5. Ejecutar migraciones fresh, bootstrap controlado, smoke tests y verificación de dominios/health.
6. Mantener rollback y backup/restore verificables.
7. No force-push ni destruir proyectos/dominios como atajo.
8. Finalizar la misión solo después de gates verdes y consolidar estado permanente antes de eliminar `.codex-mission/`.
