# 05 — Datos y persistencia

## Migraciones

Las migraciones versionadas son inmutables una vez potencialmente aplicadas. Toda evolución de esquema se implementa mediante una migración nueva y prospectiva.

## Pruebas obligatorias de migración

Para cada cambio relevante de esquema:

1. **Upgrade:** base en el baseline soportado → migración nueva → esquema/semántica esperados.
2. **Fresh install:** base vacía → todas las migraciones → mismo estado final esperado.

Ambas rutas deben ser verificables antes de cerrar el cambio.

## Staging y producción

El Supabase de integración se usa como **STAGING/INTEGRATION**. La producción se crea limpia durante Release:

1. crear Supabase PROD;
2. aplicar todas las migraciones;
3. validar fresh install;
4. configurar secretos/variables;
5. bootstrap del ADMIN real;
6. cargar únicamente datos comerciales aprobados.

La transferencia de datos reales entre entornos requiere procedimiento explícito, auditado y reversible.

## Datos de aceptación

Toda escritura remota de pruebas se identifica mediante `acceptance_run_id`, correlation ID, prefijo o mecanismo equivalente. La limpieza debe demostrar ausencia de remanentes no autorizados.

## Snapshots e historial

Los snapshots/versiones persistidos deben permitir explicar operaciones comerciales. Cuando una forma persistida evoluciona, se crea una versión nueva cuando sea necesario y se conserva compatibilidad de lectura mientras existan registros que la requieran.

## RLS, grants y secretos

- RLS/grants deben aplicar mínimo privilegio.
- Secretos nunca se versionan ni se imprimen en logs.
- Datos sensibles solo se conservan cuando una capacidad CURRENT los necesita.
