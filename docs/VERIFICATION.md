# Estado de comprobación — 25 de septiembre de 2026

La versión revisable se ejecuta localmente. El repositorio no está publicado en GitHub y no se han conectado Vercel, Supabase, Flow ni un proveedor SMTP.

## Comprobaciones automatizadas

`npm test` terminó con **40/40 resultados aprobados**, que corresponden a 38 casos y dos contenedores de suite:

- 29 casos con PostgreSQL embebido real: guardado, publicación, lectura, edición, retirada, persistencia después de cerrar y abrir la base, autenticación, reservas, POS y pedidos.
- Nueve casos de contrato HTTP y controles de Flow: firma HMAC, codificación de parámetros, errores del proveedor y de red, y límites de lectura de solicitudes.
- Los casos de inventario incluyen la última unidad disputada por 20 compradores, POS frente a checkout, límites acumulados de preventa, formularios administrativos antiguos, callbacks repetidos, expiración segura y pagos tardíos.

La compilación de producción y TypeScript pasaron. También se revisó el manifiesto de archivos del servidor: incluye las tres migraciones y excluye `.data` y los archivos `.env`.

## Recorridos de navegador

La suite `npm run test:e2e` usa Chrome, una compilación de producción local en el puerto 3100 y una base independiente en `.data/e2e`. No modifica el catálogo principal. `ALLOW_LOCAL_PRODUCTION=true` se limita a este proceso de prueba y permite los adaptadores locales; no debe configurarse en Vercel.

Los ocho recorridos cubren:

1. Artículo de Tienda: crear en el panel, subir y optimizar imagen, guardar borrador, publicar, ver como cliente, recargar, editar, verificar y retirar.
2. Preventa: el mismo recorrido con fechas, cupos, límite por cliente y condiciones de entrega.
3. POS: efectivo, cambio, consulta y recarga del ticket, descuento de stock y ajuste posterior de inventario.
4. Cuenta: registro, enlace de verificación real en el buzón local, sesión persistente, datos de torneo y rechazo de operaciones administrativas para clientes/anónimos.
5. Local: guardar y volver a leer dirección, horario, instrucciones y transportista por pagar.
6. Noticias, comunidad y torneos: crear, subir imagen, publicar, recargar detalle público, editar, retirar y borrar.
7. Dieciocho rutas públicas y administrativas a 1440 y 375 píxeles: comprobar que no existe desbordamiento horizontal y guardar capturas representativas.
8. Carrito: cantidades persistentes, descuentos, envío a agencia por pagar excluido del total y rechazo del pago sin Flow configurado sin crear pedidos ni reservar stock.

**Resultado: 8/8 recorridos aprobados, sin reintentos automáticos, en 2,8 minutos incluyendo la compilación.** Entorno: Windows, Node.js 24.18.1, Next.js 16.3.6 y Playwright 1.63.0 con Chrome. Las capturas y trazas se guardan en `test-results/`, excluido del repositorio por contener datos de prueba. Después del ajuste final de tipografía del panel, la comprobación de las 18 rutas en escritorio/celular se repitió y pasó nuevamente (1/1, 1,1 minutos incluyendo compilación). `npm run typecheck` también pasó con generación automática de tipos para copias nuevas del repositorio.

## Pendiente antes de abrir ventas online

No se ha ejecutado un pago contra Flow sandbox. Los resultados controlados de las pruebas no sustituyen esa validación. Se necesitan las credenciales sandbox del comercio y una URL HTTPS pública para comprobar creación, retorno, confirmación y conciliación real.

También faltan la conexión y pruebas de PostgreSQL/Supabase Storage remotos, SMTP real y cron cada minuto. La concurrencia local de PGlite serializa su conexión; debe repetirse con conexiones independientes de PostgreSQL en el entorno publicado.

Sigue [despliegue y variables](DEPLOYMENT.md) y [protocolo de Flow sandbox](FLOW-SANDBOX.md). Las cuentas y claves se configuran en variables de entorno, sin incluirlas en Git ni en los archivos de pruebas.
