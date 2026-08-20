# Stage 13-editorial-content — Torneos/Noticias/Comunidad/Cómics

## Objetivo

Implementar contenido editorial administrado por ADMIN y publicación pública. Torneos informativos, no motor competitivo.

## Límites

- CURRENT manda.
- No leer deliberadamente stages futuros.
- No ampliar alcance por recomendación de Skills/frameworks.
- No tocar producción salvo que este stage sea Release.
- Si una credencial externa falta y el trabajo local está completo, registrar `DEFERRED_EXTERNAL` y continuar.

## Gates mínimos

- CRUD/publication authz
- media safety
- public routes

Además aplicar `docs/CURRENT/07-PRUEBAS-Y-CALIDAD.md` según los archivos/capas afectados.

## Cierre

1. corregir fallos hasta verde;
2. revisar diff/seguridad/regresiones;
3. actualizar `IMPLEMENTATION-STATUS.md`;
4. commit(s) local(es) coherentes;
5. ejecutar `scripts/codex/mission/complete-stage.ps1` con `PASS`, `PASS_LOCAL` o `DEFERRED_EXTERNAL` según corresponda.
