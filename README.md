# SERGOD STORE

Tienda web de cartas coleccionables para SERGOD STORE, Copiapó, Chile. Incluye catálogo, preventas, cuenta de clientes, carrito, pedidos, entregas, contenido y un panel administrativo con venta presencial (POS). La interfaz es neutra y adaptable; la identidad visual definitiva queda para una etapa posterior.

La aplicación usa Next.js 16, React, TypeScript y PostgreSQL. En desarrollo funciona sin cuentas externas: PGlite guarda la base de datos en el servidor local, las imágenes se guardan como archivos WebP y los correos quedan en una bandeja privada del administrador. El pago online requiere configurar Flow; no se simulan aprobaciones desde la interfaz.

## Iniciar la versión local

Requisitos: Node.js compatible con Next.js 16 —mínimo 20.9— y npm. Ejecuta los comandos desde la carpeta del repositorio. Utiliza una versión vigente de Node admitida por el destino de despliegue.

```sh
npm ci
npm run admin:create
npm run dev
```

Abre [la tienda local](http://localhost:3000) o [el panel administrativo](http://localhost:3000/admin). Usa exactamente `localhost`, porque la protección de escritura comprueba el origen contra `APP_URL`; `127.0.0.1` es una dirección de escucha, pero no el origen configurado por defecto.

Sin `DATABASE_URL`, el primer comando `admin:create` genera un acceso de desarrollo y lo guarda en `.data/initial-access.txt`. Consulta ese archivo en tu equipo; no lo publiques ni lo subas a GitHub. Al usar una base remota, el script exige `ADMIN_EMAIL` y `ADMIN_PASSWORD`, aunque no se haya definido `NODE_ENV`. El script no reemplaza cuentas existentes: si ya creaste el administrador, utiliza el acceso guardado o la recuperación de contraseña.

No necesitas crear `.env.local` para probar el catálogo local. Para personalizar el entorno, copia `.env.example` a `.env.local` y configura solo lo necesario. Deja `DATABASE_URL` vacío para PGlite. Las migraciones se aplican automáticamente en desarrollo; también puedes ejecutarlas con `npm run db:migrate`.

PGlite debe abrirse desde un único proceso de la aplicación. Detén `npm run dev` antes de ejecutar scripts que abran la misma base local, de crear otro administrador o de respaldar `.data`. Los comandos iniciales anteriores ya respetan ese orden.

## Primer recorrido de uso

1. Entra al panel y configura **Datos del local**: dirección real, horario, instrucciones de retiro, contacto y transportistas. No se incluyen direcciones, productos, torneos ni noticias de ejemplo en el catálogo público.
2. Usa **Nuevo artículo**. Ingresa nombre, SKU, descripción, categoría, precio, cantidad e imágenes. Elige Tienda o Preventa; en Preventa completa apertura, cierre, máximo por cliente y condiciones de entrega.
3. Guarda y publica. El servidor valida los requisitos, y el panel comprueba su presencia en la sección pública. Abre el artículo, recarga, edítalo y comprueba nuevamente el cambio. Retirarlo lo oculta del catálogo.
4. Registra un cliente y verifica su correo. Sin SMTP, los mensajes se consultan en la herramienta de **Correos de prueba** del panel, disponible solo para administradores en desarrollo. No se envían mensajes a un buzón real en este modo.
5. Revisa carrito y entrega. Sin credenciales Flow y una URL HTTPS pública, el pago muestra que falta conectar el servicio. Para probar pagos reales de sandbox, sigue el [protocolo de Flow](docs/FLOW-SANDBOX.md).
6. Prueba el POS con un artículo publicado: busca por nombre o SKU, agrega cantidades, elige medio de pago y completa la venta. Efectivo calcula el cambio. El POS y la tienda web comparten existencias y respetan las reservas pendientes.

El envío **por pagar al recibir** muestra el flete como un cobro separado del transportista. Ese importe no se suma al total cobrado en Flow. Los envíos con tarifa configurada sí incorporan esa tarifa al total online. No existe cotización automática con transportistas.

## Qué está comprobado

`npm test` completa **40/40 pruebas locales**: 38 casos y dos contenedores de suite. Son 29 casos de integración con PGlite aislado y nueve de contrato HTTP y controles Flow con respuestas simuladas. Se comprueban guardado y lectura real, publicación, stock y reservas, POS, descuentos calculados por el servidor, límites de preventa, cambios concurrentes, idempotencia de pedidos y resultados de pago, autorización, recuperación de cuenta, firma HMAC y fallos de red. Los datos de integración se crean en un directorio independiente; no son contenido real de la tienda.

Estas pruebas comprueban las reglas de pago con respuestas controladas: **no equivalen a un pago realizado en Flow sandbox**. La prueba con credenciales Flow, PostgreSQL remoto, Supabase Storage, SMTP real y callbacks públicos sigue pendiente. El registro de pruebas y el recorrido exigido están en [FLOW-SANDBOX.md](docs/FLOW-SANDBOX.md).

```sh
npm run typecheck
npm test
npm run build
```

`npm run test:e2e` completó **8/8 recorridos en Chrome sobre una compilación de producción local**, con base de pruebas aislada: artículos, preventas, POS/inventario, cuenta/permisos, configuración, publicaciones, 18 rutas en computador/celular y carrito. Incluye subida y optimización real de imágenes, recarga, edición y retirada pública. Consulta el [registro de comprobación](docs/VERIFICATION.md).

Las pruebas de navegador requieren Chrome instalado. Para usar el Chromium de Playwright, instálalo con `npx playwright install chromium` y establece `PLAYWRIGHT_CHANNEL=chromium`. La suite usa el puerto 3100, `.next-e2e` y `.data/e2e`; la tienda principal puede permanecer abierta en el puerto 3000. El flujo de GitHub Actions está preparado, pero aún no se ejecutó en GitHub.

## Persistencia y publicación

En desarrollo, `.data/postgres` contiene la base, `.data/objects` las imágenes y `.data/initial-access.txt` el acceso inicial local. La sesión de cliente se conserva mediante una cookie del servidor. El navegador almacena únicamente IDs y cantidades del carrito, no el catálogo ni el stock.

Para publicar, el código está preparado para GitHub, Vercel, PostgreSQL de Supabase, Supabase Storage, Flow y SMTP. **No hay un despliegue público ni servicios externos conectados por defecto.** Las credenciales se configuran al realizar ese paso. La migración de los registros e imágenes locales hacia servicios remotos no está implementada: la instancia remota comienza con sus propias tablas y configuración, y necesita contenido cargado desde el panel.

- [Despliegue, variables de entorno, cron y respaldos](docs/DEPLOYMENT.md)
- [Arquitectura y reglas del sistema](docs/ARCHITECTURE.md)
- [Prueba real de Flow sandbox](docs/FLOW-SANDBOX.md)

La aplicación tiene autenticación propia con sesiones de PostgreSQL. **No utiliza Supabase Auth.** Las claves de base de datos, Storage, correo y Flow pertenecen exclusivamente al servidor y no deben llevar el prefijo `NEXT_PUBLIC_`.
