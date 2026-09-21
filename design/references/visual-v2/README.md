# Nueva dirección visual — Sergod Store

Estado: **referencia y propuesta en revisión**, no sustitución de `design/approved/`.

Las 22 maquetas están aquí como derivados WebP de referencia: `desktop/` y `mobile/`, once vistas
por formato. Los PNG originales permanecen en `deliverables/SERGOD-STORE-REFERENCIAS-VISUALES-V1/`.
La pantalla web no debe servir estas imágenes completas como fondo ni poner zonas de clic
transparentes encima: los textos, botones, iconos y controles se reconstruyen por separado.

## Cambios expresos del propietario

- Conservar la composición y el lenguaje de los mockups: negro, rojo y blanco, con cian de acento;
  cortes angulares, rayos, marcos y tramas.
- Eliminar frases decorativas como «Juega, colecciona, conéctate» y «Más que un juego/una tienda».
- Sustituir el ambiente futurista por un fondo oscuro abstracto hecho de vectores/rayos; no
  representar túneles, salas, edificios ni escenarios de ciencia ficción.
- Mantener únicamente el logo oficial aprobado, sin regenerarlo ni alterarlo.
- Separar cada destino, rótulo, icono, barra y control como capa manipulable.

## Primera aplicación en código

`apps/web/src/app/App.tsx` compone la portada con el logo oficial, cinco botones auténticos y
navegación auténtica. `apps/web/src/styles/launcher-v2.css` dibuja las capas ornamentales, bordes,
marcos, posiciones y estados táctiles. No usa las maquetas rasterizadas como contenido de producción.
Esto permite ajustar cada botón, texto y marco sin recortar imágenes ni modificar otros destinos.
`apps/web/src/styles/visual-v2-foundation.css` reúne colores y reemplaza el fondo cuadriculado
futurista de las rutas públicas por una base abstracta con rayos angulares discretos.

Las páginas interiores se revisarán una por una contra su respectiva maqueta antes de incorporarlas
a la biblioteca aprobada. Las rutas históricas siguen accesibles sin ocupar espacio en la nueva
navegación principal.

`LAYERS.json` especifica qué piezas deben ser elementos web independientes en cada destino.
