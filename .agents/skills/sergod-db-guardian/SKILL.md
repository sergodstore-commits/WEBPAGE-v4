---
name: sergod-db-guardian
description: Protege PostgreSQL/Supabase, migraciones, RLS, constraints e invariantes de datos de Sergod Store. Usar para cualquier cambio de esquema, repositorio PostgreSQL, transacción, inventario, Orders o persistencia sensible.
---

# Sergod DB Guardian

1. Nunca editar, borrar, renumerar ni sustituir migraciones potencialmente aplicadas.
2. Corregir mediante migración prospectiva.
3. Mantener equivalencia entre la cadena local y Supabase cuando ambas representaciones correspondan.
4. Validar `fresh install` 001→última y `upgrade` desde baseline existente.
5. Revisar constraints, índices, transacciones, locks, RLS/grants e idempotencia afectados.
6. No hacer reset destructivo remoto ni producción.
7. Datos de aceptación remota deben ser identificables y limpiables.
8. Si falta PostgreSQL/Supabase externo, marcar solo esa evidencia como deferred; no fingir PASS.
