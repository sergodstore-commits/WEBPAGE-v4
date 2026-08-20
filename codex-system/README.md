# Sergod Codex System

Capa operativa para que un Codex nuevo trabaje este repositorio con contexto mínimo y sin ampliar el producto.

## Autoridad

Este directorio **no define requisitos de producto**. La autoridad funcional sigue siendo `docs/CURRENT/`.

Orden operativo:

1. instrucción actual del propietario;
2. `docs/CURRENT/`;
3. `AGENTS.md`;
4. `.codex-mission/STATE.json` + stage actual;
5. políticas de este directorio;
6. Skills Sergod en `.agents/skills/`;
7. Skills de terceros.

## Arranque eficiente

Ejecutar desde la raíz:

```text
npm run codex:prepare
```

Ese comando no instala dependencias ni usa red. Valida el sistema Codex y genera `.runtime/codex/repo-index.json` usando hashes y metadatos del repositorio.

Las Skills Sergod son **repo-local** en `.agents/skills/`; no necesitan copiarse al perfil global. Las Skills externas se evalúan y adquieren solo bajo demanda mediante `bootstrap/use-external-skill.ps1` y el registro fijado en `EXTERNAL-SKILLS.json`.

## Regla económica

Primero localizar, luego leer. Primero prueba afectada, luego gate de stage. Un solo agente por defecto. Scripts deterministas antes que razonamiento repetitivo.
