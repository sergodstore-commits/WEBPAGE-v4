# Handoff operativo de Sergod Store Web V1

Fecha de corte: 2026-09-09.

El release productivo está activo. La fuente normativa es `docs/CURRENT/` y el estado técnico
vigente se mantiene en `docs/CURRENT/IMPLEMENTATION-STATUS.md`. La misión temporal concluyó y
`.codex-mission/` fue eliminada deliberadamente.

## Destinos finales sin secretos

- Web: proyecto Vercel `sergod-store-v4`, dominio canónico `https://www.sergodstore.cl`.
- API: Render `sergod-store-api-v4`, servicio `srv-da3ij5flk1mc7380htcg`, URL
  `https://sergod-store-api-v4.onrender.com`.
- Datos e identidad: Supabase PROD `kbhbaackrgwgvxxqdlwx`, proyecto `sergod-store-production`.
- Repositorio: `https://github.com/sergodstore-commits/WEBPAGE-v4.git`.
- Pago online productivo: exclusivamente Flow. Webpay Plus permanece fuera de V1 por decisión del
  propietario.

Los secretos viven únicamente en los stores externos y en archivos ignorados bajo `.runtime/`.
Nunca deben imprimirse, documentarse ni versionarse.

## Estado operativo

- Aplicación pública, Cuenta, Admin, POS, catálogo, inventario, checkout, Flow, editorial,
  notificaciones y despliegues cuentan con evidencia productiva.
- El registro CLIENTE exige aceptación de los Términos y condiciones 1.0.
- Supabase Auth usa el dominio oficial y callbacks exactos para confirmación, recuperación y cambio
  de correo.
- La cuenta cliente de aceptación está activa y verificada; inicio, persistencia, renovación, cierre
  y solicitud de recuperación fueron comprobados contra producción.
- El propietario carga productos, imágenes, stock y contenido real desde Admin; esas cargas no son
  trabajo pendiente de código.

## Reanudación

1. Leer `AGENTS.md`, `docs/CURRENT/INDEX.md` e `IMPLEMENTATION-STATUS.md`.
2. Ejecutar `npm run codex:prepare`; debe funcionar sin `.codex-mission/`.
3. Revisar Git y los destinos de `ops/project-targets.json` antes de operar servicios externos.
4. Aplicar pruebas focales y luego el gate requerido antes de publicar.
5. No reutilizar proyectos, URLs o credenciales antiguas como si fueran producción.
