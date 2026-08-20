# Sergod Store V1 — misión progresiva temporal

## Naturaleza

Este directorio existe únicamente para completar y validar Sergod Store Web V1. No es una segunda especificación de producto: CURRENT manda siempre.

## Regla de progressive disclosure

- Leer `STATE.json`.
- Leer únicamente `currentStageFile`.
- No abrir deliberadamente stages futuros antes de que pasen a `currentStageFile`.
- Un stage grande puede subdividirse en un plan temporal bajo `.runtime/codex/`, que nunca amplía su alcance.

## Ciclo obligatorio

```text
INSPECT → IMPLEMENT → TEST → FIX → TEST → DIFF/SECURITY REVIEW → UPDATE STATUS → COMMIT → COMPLETE STAGE
```

## Estados

- `PASS`: stage y validaciones requeridas completadas.
- `PASS_LOCAL`: stage definido como local completado.
- `DEFERRED_EXTERNAL`: implementación local completa; validación externa pendiente por credencial/acceso. Avanza y registra deuda.
- `FAIL`: problema real; no avanzar.

## Credenciales

No interrumpir la misión por credenciales si existe trabajo independiente. Acumular `DEFERRED_EXTERNAL`. La única intervención manual agrupada ocurre en el stage final de aceptación externa mediante `scripts/codex/FINAL-EXTERNAL-ACCEPTANCE.ps1`.

## Stage completion

Antes de cerrar un stage:

1. actualizar `docs/CURRENT/IMPLEMENTATION-STATUS.md` con evidencia real;
2. tener working tree controlado y commit(s) coherentes;
3. ejecutar `scripts/codex/mission/complete-stage.ps1` con el estado correcto.

El helper elimina físicamente el archivo del stage completado y avanza `STATE.json`.

## Producción

No desplegar/promover producción antes del stage Release. Staging/preview/sandbox pueden usarse conforme al stage.

## Cierre final

Después de Release, `scripts/codex/finalize-mission.ps1` elimina este directorio y helpers exclusivamente temporales. La trazabilidad útil permanece en Git y `IMPLEMENTATION-STATUS.md`.
