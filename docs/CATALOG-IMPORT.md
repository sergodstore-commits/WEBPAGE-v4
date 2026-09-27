# Catálogo Zero Mulligan

La referencia es el [catálogo público del fabricante](https://zeromulligan.cl/catalogo/). La copia de datos verificables está en `data/catalogs/zero-mulligan.json`: 12 familias y 72 variantes con SKU, precio PVP sugerido, opciones, especificaciones y 77 imágenes diferentes. Las descripciones se redactaron a partir de datos técnicos; no se incorporan condiciones comerciales ni contactos de la otra tienda.

Cada variante es un producto independiente para inventario, POS y pedidos. `catalog_group` reúne los SKU en una ficha pública con selectores de formato, color o diseño. La marca, etiquetas y ficha técnica se editan desde **Nuevo artículo / Editar artículo → Familia, opciones y ficha técnica**. Los controles reutilizan la interfaz existente, sin cambiar la identidad visual.

## Existencias y precios

La importación crea los artículos con **stock cero** y los publica como agotados. El administrador debe revisar precios e ingresar existencias reales en **Inventario** o en el editor del artículo. Se utiliza el PVP de la fuente como precio inicial editable; no se copia su disponibilidad ni se inventan cupos de preventa.

Los artículos se cargan en Tienda. Una indicación «Pronto disponible» no se convierte automáticamente en preventa: faltan las fechas, cupos y condiciones de entrega que debe definir SERGOD STORE.

## Ejecución reproducible

Aplica primero `005_catalog_variants.sql` con las migraciones habituales. Configura `APP_URL`, `ADMIN_EMAIL` y `ADMIN_PASSWORD` en el entorno privado del operador, nunca en Git. La importación inicia sesión y utiliza exclusivamente las API administrativas de la tienda: carga de imagen, guardado de artículo y publicación validada.

```sh
node --import tsx scripts/import-catalog.ts --manifest data/catalogs/zero-mulligan.json
node --import tsx scripts/import-catalog.ts --manifest data/catalogs/zero-mulligan.json --state .data/zeromulligan-import/journal.json --apply
```

Sin `--apply`, valida el manifiesto y muestra cantidades; no publica ni carga imágenes. Con `--apply`, descarga únicamente imágenes HTTPS del dominio autorizado, comprueba formato/tamaño y las carga como archivos WebP en Supabase mediante el servidor. No se utilizan enlaces externos para servir las fotografías de la tienda.

El diario privado conserva la relación entre imagen original y URL propia, así como SKU, ID y versión esperada del artículo. Se escribe antes de crear productos para recuperar una respuesta incierta. La publicación comprueba esa versión dentro de la transacción: si el administrador editó o retiró el borrador, no lo publica. Ante un error se detiene; vuelve a ejecutar con el mismo diario para continuar. Las escrituras inciertas no se repiten automáticamente. Una carga de imagen cuya respuesta se pierda puede dejar un archivo sin uso, pero no duplica productos ni stock.

Un SKU existente de otro origen detiene la importación. Los artículos ya publicados, retirados o modificados por el administrador se conservan; una reejecución no restablece cantidades ni precios. Cada publicación se comprueba mediante dos lecturas públicas independientes. Al terminar se vuelve a consultar el catálogo guardado y se escribe `report.json` junto al diario.

## Límites de la fuente

- Dados Elemental anuncia doce colores, pero solo identifica y fotografía seis: Azul, Calipso, Crystal, Morado, Rojo y Verde. Se incluyen esos seis; los demás necesitan identificación del proveedor.
- Playmats Paisajes NeoChina tiene tres diseños y aparece como «Pronto disponible», sin fecha de llegada publicada.
- Deckbox Fortaleza muestra una sola presentación XL; no publica nombres de otras variantes de color.
- Eternal Outer Sleeves tiene una portada específica por formato y dos fotografías generales adicionales, indicadas como referencia en la descripción.
- Las variantes de playmats, porta playmats y Dados Elemental reciben SKU deterministas basados en el SKU de familia y su opción, porque el fabricante no publica identificadores individuales para esas galerías.

La importación no sobrescribe artículos anteriores ni altera pedidos. La nueva migración solo añade metadatos y conserva el stock existente.

## Verificación en la tienda publicada

El 27/09/2026 se completó la importación en [SERGOD STORE](https://www.sergodstore.cl/tienda). La lectura independiente del servidor confirmó **12 familias, 72 variantes publicadas y stock total cero**. Se compararon nombres, precios, descripciones, opciones y fichas con el manifiesto. Los **77 archivos WebP** respondieron HTTP 200 desde el bucket propio; los dos artículos técnicos anteriores conservaron sus datos.

La importación se interrumpió inicialmente en una respuesta de creación. Al reanudar con el diario recuperó ese borrador sin duplicarlo. Una nueva ejecución completa devolvió **creados: 0, publicados: 0, conservados: 72**. Los informes y el diario permanecen en `.data/zeromulligan-import/`, fuera de Git.

En el navegador se comprobaron las doce familias después de recargar, las doce portadas cargadas, el filtro de marca, la vista rápida y el cambio de formato/color con imagen y SKU correspondientes. La compra permaneció deshabilitada con stock cero. [GitHub Actions](https://github.com/sergodstore-commits/WEBPAGE-v4/actions/runs/36309019944) aprobó tipos, **55/55 resultados de servidor**, compilación y **9/9 recorridos de navegador**, incluida edición administrativa y carrito con inventario independiente por variante.
