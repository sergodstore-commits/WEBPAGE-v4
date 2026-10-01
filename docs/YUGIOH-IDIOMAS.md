# Yu-Gi-Oh!: formatos e idiomas

Ampliación solicitada el 1 de octubre de 2026. Cada combinación de formato e idioma tiene una ficha, SKU, precio, inventario, reservas y máximo por cliente propios. El catálogo existente agrupa las fichas mediante `catalog_group` y muestra los selectores `Formato` e `Idioma` para las variantes publicadas.

| Familia                   | Formatos preparados                    | Idiomas                          | Sección   |
| ------------------------- | -------------------------------------- | -------------------------------- | --------- |
| Beyond the Brave          | Sobre, Token Box, Display de 24 sobres | Español e inglés en cada formato | Tienda    |
| Magnificent Maestros      | Caja de 3 sobres y cartas adicionales  | Español e inglés                 | Preventas |
| Glorious Victors          | Sobre, Display de 24 sobres            | Español e inglés en cada formato | Preventas |
| Immortal Phoenix          | Sobre, Display de 24 sobres            | Español e inglés en cada formato | Preventas |
| Structure Deck Seto Kaiba | Mazo de estructura                     | Español e inglés                 | Preventas |
| Structure Deck Yugi Muto  | Mazo de estructura                     | Español e inglés                 | Preventas |

Son **20 fichas de Yu-Gi-Oh!**, correspondientes a diez presentaciones con dos idiomas. El lote añade 14 fichas: tres de Tienda y once de Preventas, todas en borrador, con precio pendiente y stock cero. Las tres fichas previamente publicadas de Beyond the Brave en inglés conservan sus datos y publicación. Las tres preventas originales sin idioma se identifican conservando sus ID, SKU y datos comerciales: Magnificent Maestros en español, Glorious Victors e Immortal Phoenix en inglés. Las fotografías existentes corresponden a esos idiomas.

## Completar desde el panel

En [Preventas](https://www.sergodstore.cl/admin/preventas), filtra **Borradores** y busca el nombre, formato o idioma. Abre cada ficha que quieras ofrecer, completa precio, cupos, apertura, cierre, máximo por cliente y entrega, y pulsa **Publicar**. Las versiones españolas de Beyond the Brave se encuentran en [Artículos](https://www.sergodstore.cl/admin/articulos), también como borradores de Tienda.

Publicar una ficha habilita exclusivamente su formato e idioma. Retirarla la oculta; los pedidos existentes conservan su historial. Cada artículo tiene `Formato` e `Idioma` en **Familia, opciones y ficha técnica**. El nombre incluye ambos para que queden claros en carrito y pedidos.

El cupo máximo de preventa se aplica por SKU. La tienda no transforma automáticamente un display abierto en sobres individuales: las existencias se asignan a cada presentación real. La preparación de una ficha no confirma disponibilidad del proveedor.

## Imágenes y referencias

- [Glorious Victors, caja](https://goldsilver.cl/products/preventa-yu-gi-oh-glorious-victors-booster-box-espanol-ingles): 24 sobres, con fotografía del envase inglés; la variante española señala que la imagen es referencial. El precio de la fuente no se impone como precio de SERGOD.
- [Immortal Phoenix, caja](https://www.empiregames.es/producto/pre-venta-28-01-2027-yu-gi-oh-immortal-phoenix-booster-box-24x-boosters-espanol): la ficha indica 24 sobres, pero su foto muestra una caja japonesa OCG de 30. Se usa la fotografía oficial de los sobres y se aclara expresamente que el artículo es un display de 24. No se convierte su precio en euros.
- [Seto Kaiba](https://www.yugioh-card.com/eu/es/product/structure-deck-seto-kaiba/) y [Yugi Muto](https://www.yugioh-card.com/eu/es/product/structure-deck-yugi-muto/): fotografías oficiales separadas en español e inglés. Cada mazo incluye 45 cartas y sus accesorios, conforme a las fichas oficiales.
- [Beyond the Brave](https://www.yugioh-card.com/eu/es/product/beyond-the-brave/): fotografías oficiales en español para sobre y display. La nueva Token Box española utiliza una foto referencial del envase inglés, identificada en su descripción.
- [Magnificent Maestros](https://www.yugioh-card.com/eu/product/magnificent-maestros/): fotografías oficiales inglesas para la nueva variante.

Las fechas de lanzamiento regionales son información de referencia, no fechas de entrega de SERGOD. Las imágenes se guardan optimizadas como WebP en el almacenamiento de la tienda.

## Importación y conservación

El manifiesto versionado es `data/catalogs/ygo-languages-2026-10.json`. Usa el importador existente con `APP_URL`, `ADMIN_EMAIL` y `ADMIN_PASSWORD` configurados de forma privada:

```sh
node --import tsx scripts/import-catalog.ts --manifest data/catalogs/ygo-languages-2026-10.json --state .data/ygo-20261001/journal.json
node --import tsx scripts/import-catalog.ts --manifest data/catalogs/ygo-languages-2026-10.json --state .data/ygo-20261001/journal.json --apply
```

La primera orden solo valida. Conserva el mismo diario al reanudar; el importador preserva fichas existentes y ediciones del propietario. La normalización de las tres fichas previas fue una actualización administrativa específica, respaldada y protegida por versión; no renombró SKU, reasignó existencias ni cambió condiciones de venta.

No se requieren migraciones ni cambios en la interfaz, pagos o diseño. Mitos y Leyendas conserva sus fichas y las existencias cargadas por el propietario.

## Comprobación de guardado

La API administrativa guardó las 14 fichas nuevas y las tres normalizaciones. Una lectura independiente posterior comprobó los 20 SKU de Yu-Gi-Oh!, seis familias y diez pares de formato con español/inglés, sin combinaciones duplicadas. Las 24 imágenes WebP únicas de esas fichas respondieron HTTP 200 desde el almacenamiento propio.

Dos lecturas administrativas completas y las lecturas individuales coincidieron. Los 14 detalles nuevos devolvieron 404 para clientes, conforme a su estado de borrador. Se conservaron los campos comerciales de las tres fichas normalizadas y los 77 registros anteriores restantes. Durante la operación el propietario eliminó diez variantes de Augurio y lo confirmó expresamente; esas eliminaciones se respetaron. Los informes detallados permanecen en archivos privados locales.

Pasaron TypeScript y los 17 resultados de las pruebas del importador y variantes, incluidos persistencia, exclusión pública de borradores e inventario independiente. La actualización del catálogo usa la API ya desplegada; no depende de desplegar una nueva interfaz.
