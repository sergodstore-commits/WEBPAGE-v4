# Cartas de la portada

La portada conserva su composición, reversos y efectos y alterna las caras cada ocho segundos mientras está visible. Las 20 imágenes aportadas en `ij` se distribuyen en doce de Yu-Gi-Oh! y ocho de MyL; cada juego conserva su propio ciclo. Se mantienen las cartas originales en la primera escena.

Las versiones WebP de 480 y 320 px están en `public/art/hero/rotation`; `sources.json` permite localizar cada original y el encuadre utilizado. Se recortan los márgenes vacíos de las copias para que la carta llene su plano, con su proporción real y sin un contorno claro añadido. Los archivos originales permanecen intactos. `scripts/prepare-hero-rotation.mjs` prepara las versiones y `lib/hero/rotation-assets.json` registra sus dimensiones y rutas.

Solo se precargan las siguientes cartas visibles antes del cambio. Pausar, ocultar la pestaña, salir de la portada o activar movimiento reducido detiene la alternancia. El cambio de imagen no reinicia las animaciones de posición y no afecta al catálogo ni al stock. No hay servicios ni variables nuevas.
