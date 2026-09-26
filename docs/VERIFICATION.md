# Estado de comprobación — 25 de septiembre de 2026

La versión revisable se ejecuta localmente y su infraestructura remota ya está preparada parcialmente. Supabase tiene un esquema privado nuevo y se completaron pruebas con conexiones PostgreSQL reales. Todavía no se ha publicado este código en GitHub ni desplegado esta versión en Vercel, y no se ha completado una compra real en Flow sandbox.

## Comprobaciones automatizadas

`npm test` terminó con **45/45 resultados aprobados**, que corresponden a 43 casos y dos contenedores de suite:

- 29 casos con PostgreSQL embebido real: guardado, publicación, lectura, edición, retirada, persistencia después de cerrar y abrir la base, autenticación, reservas, POS y pedidos.
- Nueve casos de contrato HTTP y controles de Flow: firma HMAC, codificación de parámetros, errores del proveedor y de red, y límites de lectura de solicitudes.
- Tres casos de configuración de base: validación de identificadores, CA/verificación TLS conservadas y migraciones privadas junto a tablas antiguas incompatibles, sin fallback a `public`.
- Dos casos de protección de limpieza: solo se acepta el nombre aleatorio exacto creado por la ejecución y su marcador; se rechazan esquemas productivos, patrones e inyección SQL.
- Los casos de inventario incluyen la última unidad disputada por 20 compradores, POS frente a checkout, límites acumulados de preventa, formularios administrativos antiguos, callbacks repetidos, expiración segura y pagos tardíos.

La compilación de producción actual y TypeScript pasaron. También se revisó el manifiesto de archivos del servidor: incluye las tres migraciones y excluye `.data` y los archivos `.env`.

## Preparación y verificación remotas

- **Supabase PostgreSQL:** conexión TLS validada, tres migraciones aplicadas en `sergod_store` y administrador verificado creado. La aplicación usa autenticación propia; no importa cuentas de Supabase Auth.
- **Proyecto anterior:** las tablas de `public` permanecen intactas. El inventario leído conserva siete productos, cero pedidos y dos cuentas. No se migró su contenido ni se mezcló con el catálogo nuevo.
- **Storage:** creado el bucket público `product-images`; la clave `service_role` JWT heredada se comprobó válida. Falta el recorrido de carga y publicación desde la web desplegada.
- **Correo:** Resend aceptó la autenticación SMTP. No se envió correo en esta comprobación; entrega, recepción y enlaces de verificación/recuperación siguen pendientes.
- **Flow:** las credenciales sandbox respondieron a una consulta firmada de lectura con `Transaction not found`. No se creó ni pagó una transacción real de sandbox.
- **Vercel:** framework Next.js actualizado y 19 variables privadas guardadas en el entorno de producción. Aún no se desplegó esta versión.
- **GitHub:** remoto `origin` enlazado a `sergodstore-commits/WEBPAGE-v4`, rama `main` leída en `bf8cf4d`. La etiqueta `legacy-before-rebuild-20260925` ya se subió para conservar esa versión anterior. El código nuevo todavía no se subió.

La ejecución de `node --import tsx scripts/verify-postgres.ts` contra PostgreSQL remoto aprobó **9/9 comprobaciones**:

1. Migraciones reales e idempotentes en un esquema temporal propio.
2. Tres conexiones PostgreSQL simultáneas con esquema privado correcto.
3. Veinte checkouts concurrentes sobre una unidad: solo una reserva.
4. Diez callbacks aprobados concurrentes: un descuento de stock, un evento de aprobación y un correo en cola.
5. Seis carreras POS/checkout sin consumir dos veces la última unidad.
6. Seis reservas simultáneas de un cliente respetan su máximo de dos.
7. POS repetido concurrentemente conserva un ticket, descuento y cambio correctos.
8. Un carrito imposible no deja pedidos ni reservas parciales.
9. Cerrar/reabrir el pool conserva pedidos e inventario; ningún correo fue enviado.

Resultado registrado: `simultaneousConnections=3`, `mockFlowRequests=13`, `realFlowRequests=0`, `emailsSent=0`, `cleanupVerified=true`. Flow estuvo completamente simulado. El script cerró sus conexiones y eliminó solo el esquema `sergod_verify_` que había creado, validando nombre y marcador; no usó el esquema de la tienda ni las tablas antiguas. La ejecución se puede repetir con las [instrucciones del script](../scripts/verify-postgres.md).

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

No se ha ejecutado un pago contra Flow sandbox. Los resultados controlados y la consulta inicial de credenciales no sustituyen esa validación. Las claves ya están configuradas; falta desplegar una URL HTTPS pública de esta versión y comprobar creación, retorno, confirmación y conciliación real.

También faltan subir el código nuevo, desplegarlo, repetir los recorridos desde la web remota, cargar y leer imágenes en Storage, comprobar recepción de correos y activar/verificar el cron cada minuto. La concurrencia de PostgreSQL ya se comprobó con conexiones independientes; esto no reemplaza la verificación del recorrido HTTP completo en Vercel.

Sigue [despliegue y variables](DEPLOYMENT.md) y [protocolo de Flow sandbox](FLOW-SANDBOX.md). Las cuentas y claves se configuran en variables de entorno, sin incluirlas en Git ni en los archivos de pruebas.
