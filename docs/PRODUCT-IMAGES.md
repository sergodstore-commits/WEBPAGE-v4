# Imágenes del catálogo

Las imágenes existentes se normalizaron desde los archivos originales: WebP con transparencia, lienzo de 1024 × 1024 y producto centrado con un lado máximo de 880 píxeles. Se mantienen las proporciones; una caja ancha y un sobre vertical no se deforman para ocupar el mismo rectángulo.

En diez archivos con fondo blanco se eliminó solamente el área clara conectada al exterior mediante recorte técnico. No se generaron ilustraciones, textos ni empaques nuevos. Los tapetes conservan su arte rectangular completo.

`scripts/normalize-product-images.mjs` procesa una auditoría privada en `.data/product-image-audit.json`. Produce archivos y un manifiesto privados para revisión antes de publicar. No incorpora credenciales ni altera la base de datos. La publicación registra archivos nuevos, conserva los originales y modifica exclusivamente referencias de imágenes y la versión del artículo. Stock, precios y pedidos permanecen intactos.

Para nuevas fotografías, preparar un lienzo transparente con estas mismas dimensiones antes de cargarlo en el panel. La carga habitual optimiza a WebP; no elimina fondos automáticamente, para evitar recortar partes claras del producto sin revisión.
