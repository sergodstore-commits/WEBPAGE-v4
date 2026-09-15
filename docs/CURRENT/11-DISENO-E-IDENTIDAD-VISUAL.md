# 11 — Diseño e identidad visual

## Dirección obligatoria

Sergod Store usa una estética TCG moderna, dinámica y de alto contraste inspirada en la energía gráfica de interfaces de cómic/videojuego, sin copiar composiciones, personajes ni propiedad intelectual ajena.

### Paleta

- negro, rojo y blanco: dominantes;
- grises oscuros: soporte;
- cian: **solo acento** puntual.

### Lenguaje gráfico

- paneles angulares e irregulares;
- cortes diagonales;
- bloques inclinados;
- halftone/tramas de cómic;
- pinceladas y fragmentos;
- bordes gruesos multicapa;
- líneas dinámicas;
- alto contraste y jerarquía clara;
- espacio negativo suficiente para no saturar.

## Prohibido

- medieval/fantasía oscura/Dark Souls;
- dorados antiguos, pergaminos o marcos barrocos;
- dragones decorativos;
- personajes/ojos/ciudades/edificios decorativos inventados;
- cartas, cajas o arte de franquicias reconocibles salvo contenido comercial legítimo aportado por la tienda;
- logos o símbolos inventados;
- coronas decorativas;
- glassmorphism azul/índigo como identidad principal;
- UI SaaS corporativa genérica;
- texto horneado dentro de assets cuando debe ser contenido web dinámico.

Excepción aprobada por el propietario: los cinco rótulos ilustrados activos del lanzador de portada
(`Tienda`, `Preventas`, `Comunidad`, `Puntos Sergod` y `Cómics e historias`) pueden conservar su texto
como parte del arte. El nombre accesible y el destino siguen definidos en HTML y permanecen separados
de la imagen, de modo que personalizar el arte nunca altere ni elimine el vínculo. Los rótulos
históricos de Noticias, Torneos y Quests pueden conservarse en la biblioteca aprobada, pero no son
accesos independientes de la portada.

## Assets

- `design/source-existing/`: fuentes visuales de trabajo; no son aprobación de producción.
- `design/references/`: referencias/mockups para dirección/composición.
- `design/approved/`: única biblioteca visual aprobada para uso productivo.
- `design/manifest/`: hashes, procedencia y reglas.

Los rótulos aprobados para el lanzador se registran de forma independiente en
`design/manifest/APPROVED-HOME-LAUNCHER-ASSETS.json`; esta excepción no aprueba otros assets con
texto horneado.

### Portada tipo lanzador

La primera pantalla de `/` es un lanzador visual de altura completa, no una portada convencional
precedida por el encabezado general. El logo oficial ocupa el centro y los cinco accesos activos se
distribuyen a su alrededor en escritorio. El encabezado y la navegación general aparecen después de
entrar a una sección, evitando duplicar arriba los mismos destinos del lanzador.

En teléfonos, la composición conserva primero el logo y presenta los cinco accesos en dos columnas,
sin recortar el arte ni provocar desplazamiento horizontal. `Ingresar` o `Mi cuenta`, `Registro` y
`Carrito` siguen disponibles como utilidades compactas. La imagen de cada acceso es personalizable,
pero su nombre accesible y su ruta fija permanecen definidos fuera del asset.

### Movimiento del lanzador

El movimiento expresa jerarquía y continuidad, no decoración constante:

- el logo y los cinco accesos entran por capas en menos de aproximadamente 1,3 segundos;
- al enfocar o apuntar un destino, este gana contraste y los demás reducen su intensidad;
- al seleccionar, las alas izquierda y derecha salen en direcciones opuestas y la sección aparece
  mediante un barrido angular;
- el movimiento fuerte queda concentrado en Inicio; catálogo, checkout, cuenta, Admin y POS priorizan
  respuesta inmediata y legibilidad;
- `prefers-reduced-motion` elimina la transición expresiva sin perder ninguna acción o contenido;
- las animaciones se construyen con recursos Sergod y no reproducen personajes, sonidos,
  composiciones ni recursos protegidos de videojuegos de referencia.

### Logo

`design/approved/branding/logo_sergod_store_oficial.png` es inmutable:

- no regenerar;
- no recolorear;
- no distorsionar;
- no recortar;
- no “mejorar” con IA;
- redimensionar solo mediante layout/CSS o derivación técnica que preserve proporción/archivo fuente.

## Etapas visuales

1. DESIGN-0: inventario/categorización, sin rediseñar lógica.
2. DESIGN-1: tokens y componentes base antes de construir todas las pantallas.
3. DESIGN-2: aplicación estética sobre flujos funcionales.
4. DESIGN-3: responsive, accesibilidad y visual regression.

## Rendimiento

Los derivados web pueden optimizarse a formatos/tamaños adecuados, pero el source aprobado se conserva. No enviar assets experimentales innecesarios al bundle/public.
