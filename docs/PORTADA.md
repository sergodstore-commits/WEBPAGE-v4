# Portada de una pantalla

Desde el 9 de octubre de 2026, Inicio muestra únicamente la cabecera de navegación y la escena de cartas con el mensaje principal. Catálogo, preventas, noticias y torneos se consultan en sus secciones. Inicio ya no solicita sus listas ni muestra bloques inferiores o el pie de página completo.

La composición ocupa la altura disponible mediante una cuadrícula y `100svh`, sin bloquear el desplazamiento del documento. En pantallas muy bajas, con textos administrativos extensos o zoom elevado, se permite desplazamiento para conservar acceso al contenido. Las páginas interiores mantienen su pie y su desplazamiento habitual.

En computador los cinco destinos están en la navegación superior. En celular y tablet, Tienda y Torneos conservan sus botones principales y Preventas, Comunidad y Noticias tienen accesos visibles bajo los enlaces por juego. También se mantiene el menú móvil, cuenta, carrito, navegación por teclado, pausa y preferencia de movimiento reducido. Las cartas siguen alternando cada ocho segundos.

Validación: TypeScript y seis recorridos de Playwright aprobados. Incluyen carga y rotación de cartas, pausa, teclado, menú móvil, filtros por juego persistentes al recargar y ausencia de consultas a contenido secundario en Inicio. El recorrido de una pantalla comprueba 320×568, 375×667, 375×812, 768×1024, 1280×600 y 1440×900, sin desplazamiento vertical u horizontal y con accesos utilizables dentro del viewport.

No se modificaron noticias, fuentes externas, productos, stock, pedidos ni pagos.

## Ambientación de la portada — punto 1

El fondo incorpora luz cian y azul violeta en los laterales, una textura tenue, trazos geométricos, partículas y un círculo de invocación en perspectiva. El centro mantiene contraste para el texto y los botones. Las dimensiones, el logo y las posiciones de las cartas se conservan.

`HeroAtmosphere` usa únicamente CSS y SVG en línea, sin imágenes adicionales, videos, GIF ni nuevas dependencias. El círculo emite un pulso breve cuando `HeroScene` termina de precargar y cambia las cartas. No añade un temporizador ni un bucle JavaScript de animación. Las animaciones CSS usan transformaciones y opacidad; quedan pausadas con el control de movimiento, al ocultar la pestaña o al salir de vista. La preferencia de movimiento reducido muestra una composición estática completa.

En celular se omiten las capas grandes de iluminación animada, la textura y los haces, y se muestran cuatro partículas en vez de ocho. Esto reduce el trabajo gráfico; el consumo final sigue dependiendo del dispositivo y del navegador.

Validación de este cambio: `npm run typecheck` y los seis recorridos de `hero.spec.ts` / `hero-rotation.spec.ts` aprobados. La comprobación de inmovilidad ahora inspecciona también el fondo. Capturas revisadas a 1440×900, 375×812 y 320×568; el recorrido automático cubre los seis tamaños indicados arriba.
