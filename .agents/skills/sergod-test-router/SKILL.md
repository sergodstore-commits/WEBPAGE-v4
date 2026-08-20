---
name: sergod-test-router
description: Selecciona y escala pruebas de Sergod Store según archivos afectados y gate del stage. Usar después de cambios de código y antes de ejecutar suites para evitar full-suite repetitivo sin perder cobertura final.
---

# Sergod Test Router

Escalar en cuatro niveles:

1. **LOCAL**: test del archivo/módulo afectado cuando exista.
2. **CONTEXT**: suite unit/application/contract/web correspondiente.
3. **INTEGRATION**: integración local cuando el cambio cruza persistencia, HTTP, auth, inventario o checkout.
4. **GATE**: todos los comandos exigidos por el stage; `verify` en hardening/release o cuando CURRENT lo requiera.

Reglas:

- Si un nivel falla, corregir antes de ampliar por rutina.
- Cambios en contratos requieren contract + consumidores.
- Cambios en migraciones requieren upgrade + fresh install.
- Cambios visuales no justifican tests API completos salvo dependencia real.
- El gate final del stage nunca se sustituye por tests parciales.
