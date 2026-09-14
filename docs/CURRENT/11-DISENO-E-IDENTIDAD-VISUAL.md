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
- glassmorphism azul/índigo como identidad principal;
- UI SaaS corporativa genérica;
- texto horneado dentro de assets cuando debe ser contenido web dinámico.

Excepción aprobada por el propietario: los ocho rótulos ilustrados del lanzador de portada
(`Tienda`, `Preventas`, `Torneos`, `Noticias`, `Comunidad`, `Loyalty`, `Quests` y
`Cómics e historias`) pueden conservar su texto como parte del arte. El nombre accesible y el
destino siguen definidos en HTML y permanecen separados de la imagen, de modo que personalizar el
arte nunca altere ni elimine el vínculo.

## Assets

- `design/source-existing/`: fuentes visuales de trabajo; no son aprobación de producción.
- `design/references/`: referencias/mockups para dirección/composición.
- `design/approved/`: única biblioteca visual aprobada para uso productivo.
- `design/manifest/`: hashes, procedencia y reglas.

Los rótulos aprobados para el lanzador se registran de forma independiente en
`design/manifest/APPROVED-HOME-LAUNCHER-ASSETS.json`; esta excepción no aprueba otros assets con
texto horneado.

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
