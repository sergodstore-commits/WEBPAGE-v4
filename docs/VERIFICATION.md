# Estado de comprobación — 26 de septiembre de 2026

La versión revisable está publicada en [www.sergodstore.cl](https://www.sergodstore.cl), con código en [WEBPAGE-v4](https://github.com/sergodstore-commits/WEBPAGE-v4). La nueva tienda reemplazó el contenido de `main` conservando el historial anterior y una etiqueta de respaldo. Supabase, Storage, Resend y Flow sandbox están conectados. **No hay cobros de dinero real:** la interfaz muestra el modo de prueba.

## Comprobaciones automatizadas

`npm test` terminó con **45/45 resultados aprobados**, que corresponden a 43 casos y dos contenedores de suite:

- 29 casos con PostgreSQL embebido real: guardado, publicación, lectura, edición, retirada, persistencia después de cerrar y abrir la base, autenticación, reservas, POS y pedidos.
- Nueve casos de contrato HTTP y controles de Flow: firma HMAC, codificación de parámetros, errores del proveedor y de red, y límites de lectura de solicitudes.
- Tres casos de configuración de base: validación de identificadores, CA/verificación TLS conservadas y migraciones privadas junto a tablas antiguas incompatibles, sin fallback a `public`.
- Dos casos de protección de limpieza: solo se acepta el nombre aleatorio exacto creado por la ejecución y su marcador; se rechazan esquemas productivos, patrones e inyección SQL.
- Los casos de inventario incluyen la última unidad disputada por 20 compradores, POS frente a checkout, límites acumulados de preventa, formularios administrativos antiguos, callbacks repetidos, expiración segura y pagos tardíos.

La compilación de producción actual y TypeScript pasaron. El primer paquete Turbopack compiló pero omitió dependencias internas del servidor y devolvió HTTP 500 en Vercel. Se corrigió en `87d7566` usando Webpack. `scripts/verify-build-trace.mjs` ahora bloquea la construcción si faltan runtime/dependencias críticas o aparecen archivos privados. Los manifiestos comprobados incluyen 100 dependencias para páginas y 268 para la API, con las tres migraciones y sin `.data`, `s` ni archivos `.env`.

## Preparación y verificación remotas

- **Supabase PostgreSQL:** conexión TLS validada, tres migraciones aplicadas en `sergod_store` y administrador verificado creado. La aplicación usa autenticación propia; no importa cuentas de Supabase Auth.
- **Proyecto anterior:** las tablas de `public` permanecen intactas. El inventario leído conserva siete productos, cero pedidos y dos cuentas. No se migró su contenido ni se mezcló con el catálogo nuevo.
- **Storage:** bucket público nuevo `product-images`; carga autenticada mediante la API publicada, optimización a WebP y lectura pública HTTP 200 comprobadas. El bucket antiguo sigue privado.
- **Productos/preventas:** por la API administrativa publicada se creó cada tipo, cargó su imagen, publicó, leyó dos veces desde las rutas públicas, editó, volvió a comprobar y retiró. Los dos artículos se identificaron como pruebas técnicas y no están publicados.
- **Local:** dirección, horario y contacto que ya figuraban publicados en el proyecto antiguo se guardaron y releyeron mediante la API nueva. No se trasladaron los siete productos antiguos.
- **Correo de pedidos:** seis mensajes aceptados por Resend/SMTP y registrados `sent`, sin duplicados: pendiente y vencimiento del pedido #1, pendiente y aprobación del #2, pendiente y rechazo del #3. `sent` comprueba aceptación por SMTP, no presencia en la bandeja del destinatario.
- **Cuenta remota:** con el correo expresamente autorizado se comprobó registro, inicio de sesión, verificación con token de un solo uso, rechazo HTTP 403 del acceso administrativo, recuperación de contraseña, revocación de la sesión anterior y acceso con la nueva contraseña. Resend/SMTP aceptó los dos mensajes de verificación y recuperación, con un intento cada uno. Los tokens se obtuvieron de los mensajes de esa cuenta en la cola del servidor y se usaron contra la API publicada; no se accedió a su bandeja externa. La contraseña queda únicamente en el archivo privado local `.data/verified-customer.json`.
- **Flow real en sandbox:** tres órdenes de $1.000 CLP. #1 expiró (estado Flow 4) y liberó reserva; #2 fue aprobada mediante el simulador MACH, descontó stock 3 → 2 y liberó la reserva; #3 fue rechazada (estado Flow 3), conservando stock 2 y reserva 0. El retorno del navegador llegó al detalle protegido del pedido. Cuatro confirmaciones repetidas de #2 devolvieron HTTP 200 sin duplicar movimiento, evento ni correo; el retorno repetido respondió 303. Véase [registro Flow](FLOW-SANDBOX.md).
- **Vercel:** proyecto `sergod-store-v4`, Next.js, Node 24 y 19 variables del servidor guardadas como secretos en producción. El [despliegue funcional `87d7566`](https://vercel.com/sergod-store/sergod-store-v4/8n3cpZD9vnSfnzGw7m6C8np3FDwb) sirve el dominio, `/api/health`, ajustes, catálogo y acceso administrativo.
- **GitHub:** `main` se actualizó sin forzar ni borrar historia. La etiqueta `legacy-before-rebuild-20260925` conserva `bf8cf4d`. La carpeta `s`, claves y datos locales están excluidos del repositorio y del artefacto; se comprobaron los archivos nuevos contra los valores secretos suministrados.
- **Conciliación:** trabajo `sergod_store_reconcile` (id 5) cada minuto en Supabase Cron; credenciales guardadas en Vault. Se comprobaron ejecuciones SQL correctas y una invocación HTTP 200 con `failed=0`. Los trabajos antiguos permanecen separados.

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

Después del cambio de empaquetado, [GitHub Actions sobre `87d7566`](https://github.com/sergodstore-commits/WEBPAGE-v4/actions/runs/36212003148) aprobó nuevamente tipos, 45 resultados de servidor, construcción con control de artefactos y los ocho recorridos en Chromium/Linux. La repetición local tuvo una interrupción prolongada (50,9 minutos): siete recorridos pasaron y carrito venció por timeout; se repitió solo ese caso y pasó en 54,4 segundos incluyendo construcción. No se ocultó ese fallo mediante reintentos automáticos.

## Pendiente antes de abrir ventas online

Flow permanece deliberadamente en sandbox. Para abrir ventas comerciales faltan las claves de producción, cargar catálogo real y configurar los transportistas e instrucciones definitivas. El pago real de sandbox usó retiro; el flete por pagar se comprobó con pruebas de servidor/navegador, no con un transportista comercial durante el pago remoto.

La recepción efectiva en la bandeja de entrada debe confirmarla el destinatario; el registro, la verificación y la recuperación remotos ya están comprobados con los tokens de los mensajes enviados. Los casos de creación de pago incierta y pago tardío se probaron con respuestas controladas; no se provocaron fallos de red contra el proveedor. El servicio Render del proyecto anterior, sus cron y sus tablas se conservaron; la web nueva usa su servidor Next.js y el esquema privado nuevo.

Sigue [despliegue y variables](DEPLOYMENT.md) y [protocolo de Flow sandbox](FLOW-SANDBOX.md). Las cuentas y claves se configuran en variables de entorno, sin incluirlas en Git ni en los archivos de pruebas.
