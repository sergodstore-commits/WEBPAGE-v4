# Selección Yu-Gi-Oh! y Mitos y Leyendas

Lote solicitado el 27/09/2026, preparado en `data/catalogs/selected-tcg-2026-09.json`. Conserva el formato existente de la tienda: fotografías de referencia almacenadas en Supabase, familias con opciones y un SKU con inventario independiente para cada presentación. No incluye cambios de identidad visual.

## Presentaciones y clasificación

| Artículo | Precio inicial CLP | Sección prevista |
| --- | ---: | --- |
| Beyond the Brave · Display de 24 sobres · Inglés | $104.790 | Tienda |
| Beyond the Brave · Token Box · Inglés | $19.249 | Tienda |
| Beyond the Brave · Sobre · Inglés | $4.990 | Tienda |
| Magnificent Maestros · Caja | Pendiente | Preventas, borrador |
| Glorious Victors · Sobre | Pendiente | Preventas, borrador |
| Immortal Phoenix · Sobre | Pendiente | Preventas, borrador |
| Leyendas Primer Bloque 4.0 · 3 displays + 3 Buy a Box | $177.990 | Tienda |
| Leyendas Primer Bloque 4.0 · Display + 1 Buy a Box | $65.990 | Tienda |
| Leyendas Primer Bloque 4.0 · Sobre | **$2.500** | Tienda |
| Leyendas Primera Era 4.0 · Display | $58.990 | Tienda |
| Relatos Dominios de Ra · Sabiduría (Sacerdote) | $26.990 | Tienda |
| Relatos Dominios de Ra · Invasores (Faraón) | $26.990 | Tienda |
| Relatos Dominios de Ra · Amanecer (Eterno) | $26.990 | Tienda |
| Halloween · Tinieblas | $29.990 | Preventas, borrador |
| Halloween · Abismo | $29.990 | Preventas, borrador |
| Leyendas Primera Era 4.0 · Sobre | **$2.500** | Tienda |

Los dos precios de $2.500 son instrucciones expresas del propietario. El resto son precios visibles de referencia, editables en el panel; no se copian descuentos ni disponibilidad de otros vendedores. Los tres Beyond the Brave van a Tienda por instrucción del propietario aunque las referencias aún mencionen preventa. En Mitos y Leyendas solo Halloween va a Preventas.

**Primer Bloque y Primera Era permanecen en familias distintas.** Los dos sobres tienen SKU, imagen, precio e inventario propios. Las cuatro imágenes de arte del sobre Primer Bloque forman una galería del mismo sobre; no crean cuatro variantes ni prometen un arte seleccionable. Un pack de tres displays cuenta como una unidad de esa presentación; asigna sus existencias como packs completos, con sus tres Buy a Box.

## Preventas pendientes

Las cinco preventas se guardan como borradores con imágenes y ficha técnica. No se publican ni permiten reservar hasta completar apertura, cierre, máximo por cliente y condiciones de entrega de SERGOD. Las tres fichas oficiales de Yu-Gi-Oh! no publican precio CLP: el valor cero queda únicamente en el borrador, nunca como una oferta gratuita. Antes de publicar, confirma precio, idioma y presentación comercial; la referencia describe caja para Magnificent Maestros y sobres para Glorious Victors e Immortal Phoenix.

Las fechas oficiales de Europa y Norteamérica se identifican como lanzamientos regionales; no se usan como fechas de entrega en Copiapó ni como plazos de reserva. Los anuncios de Halloween de otra tienda tampoco determinan compromisos de SERGOD. Sus promociones externas Buy a Box no se agregan al contenido.

## Importación y conservación

El importador crea todo con stock cero y valida el manifiesto antes de cargar archivos. Optimiza los PNG grandes y sube las imágenes por la API administrativa existente. Solo acepta HTTPS en los hosts observados y autorizados; permite redirecciones dentro del mismo host y la redirección oficial comprobada de `www.yugioh-card.com` a `img.yugioh-card.com` únicamente para `/eu/wp-content/uploads/`, conservando exactamente ruta y consulta. Rechaza los demás cambios de host.

Configura privadamente `APP_URL`, `ADMIN_EMAIL` y `ADMIN_PASSWORD`, sin modificar las claves vigentes de Flow. Ejecuta desde el repositorio:

```sh
node --import tsx scripts/import-catalog.ts --manifest data/catalogs/selected-tcg-2026-09.json --state .data/card-import-20260927/journal.json
node --import tsx scripts/import-catalog.ts --manifest data/catalogs/selected-tcg-2026-09.json --state .data/card-import-20260927/journal.json --apply
```

Sin `--apply` no escribe en la tienda. Reutiliza siempre el mismo diario al reanudar. La fase `draft` preserva los borradores terminados: repetir la importación no publica preventas ni restablece precios, stock o ediciones posteriores del administrador. Cada borrador se lee dos veces desde administración y se comprueba que su detalle público responda 404; cada artículo publicado se vuelve a leer públicamente. El informe final se guarda junto al diario privado.

Las descripciones se redactaron a partir de los datos de los enlaces proporcionados; no se copiaron políticas de cancelación, envío, cuotas ni contactos de otros comercios. Las referencias concretas quedan en `source_url` dentro del manifiesto y en el editor administrativo.
