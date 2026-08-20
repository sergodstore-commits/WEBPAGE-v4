# Stage 01-conformance — Verificar conformidad CURRENT

## Objetivo

Verificar que las superficies ejecutables, contratos y tests del baseline correspondan a capacidades explícitas de CURRENT. Corregir únicamente inconsistencias verificadas antes de iniciar nuevas features. No realizar una auditoría histórica ni reconstruir decisiones previas.

## Límites

- CURRENT manda.
- Cargar solo los documentos y archivos necesarios para la inconsistencia encontrada.
- No ampliar alcance por recomendación de Skills/frameworks.
- No tocar producción.
- Si una credencial externa falta y el trabajo local está completo, registrar `DEFERRED_EXTERNAL` y continuar.

## Gates mínimos

- mapa breve capacidad CURRENT → superficie ejecutable afectada
- cero imports/rutas/contratos rotos
- tests afectados PASS
- upgrade + fresh install si cambia persistencia
- working tree coherente al cierre

Además aplicar `docs/CURRENT/07-PRUEBAS-Y-CALIDAD.md` según los archivos/capas afectados.

## Cierre

1. corregir fallos hasta verde;
2. revisar diff/seguridad/regresiones;
3. actualizar `IMPLEMENTATION-STATUS.md`;
4. commit(s) local(es) coherentes;
5. ejecutar `scripts/codex/mission/complete-stage.ps1` con el estado correcto.
