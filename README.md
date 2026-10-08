# SERGOD STORE

Tienda web de cartas coleccionables para SERGOD STORE, Copiapó, Chile. Incluye catálogo, preventas, cuenta de clientes, carrito, pedidos, entregas, contenido y un panel administrativo con venta presencial (POS). La entrega final del 7 de octubre incorpora la identidad oficial y las seis fases de interfaz adaptable.

Torneos utiliza [YouTube](docs/YOUTUBE.md) desde el 7 de octubre de 2026: directos y grabaciones del canal @SergodStore se publican desde el panel, sin claves de API. Comunidad/[rankings](docs/RANKINGS.md) y Noticias/[Instagram](docs/INSTAGRAM-NOTICIAS.md) forman parte de la entrega. Instagram está conectado mediante Facebook en modo de lectura. En [Noticias se actualizan y seleccionan publicaciones](docs/INSTAGRAM-SELECTION.md) sin hashtag; los medios permanecen en Instagram y no se publican noticias automáticamente.

El [panel administrativo rediseñado](docs/ADMIN.md) organiza las herramientas por catálogo, ventas, comunidad y configuración, con navegación móvil accesible y formularios compartidos. [Carrito, Cuenta y Checkout](docs/COMPRA-CUENTA.md) completan la entrega.

La revisión final aprobó 96 pruebas de servidor y 40 recorridos únicos de navegador, además de TypeScript y compilación de producción con trazado seguro. Las migraciones 007–010 ya están aplicadas en `sergod_store`: se conservaron 104 artículos, 117 imágenes registradas, siete pedidos, 31 unidades de stock y la configuración existente. Consulta [el registro de verificación](docs/VERIFICATION.md) para los límites de estas pruebas y las tareas comerciales pendientes.

[Carrito, Cuenta y Checkout](docs/COMPRA-CUENTA.md) comparten el nuevo módulo de compra, con pasos explícitos, importes y entrega separados, perfil e historial adaptables. Su publicación también queda para la revisión final.

La aplicación usa Next.js 16, React, TypeScript y PostgreSQL. En desarrollo funciona sin cuentas externas: PGlite guarda la base de datos en el servidor local, las imágenes se guardan como archivos WebP y los correos quedan en una bandeja privada del administrador. El pago online requiere configurar Flow; no se simulan aprobaciones desde la interfaz.

Tienda publicada: [www.sergodstore.cl](https://www.sergodstore.cl) · [Administración](https://www.sergodstore.cl/admin) · [Repositorio](https://github.com/sergodstore-commits/WEBPAGE-v4). La configuración de Vercel usa **Flow producción**, autorizada después de las pruebas sandbox. Las claves se guardan como secretos del servidor. Consulta la evidencia y los límites en [VERIFICATION.md](docs/VERIFICATION.md).

## Iniciar la versión local

Requisitos: Node.js 24 y npm. Ejecuta los comandos desde la carpeta del repositorio; `package.json` fija la misma versión mayor usada en Vercel y en las pruebas.

```sh
npm ci
npm run admin:create
npm run dev
```

Abre [la tienda local](http://localhost:3000) o [el panel administrativo](http://localhost:3000/admin). Usa exactamente `localhost`, porque la protección de escritura comprueba el origen contra `APP_URL`; `127.0.0.1` es una dirección de escucha, pero no el origen configurado por defecto.

Sin `DATABASE_URL`, el primer comando `admin:create` genera un acceso de desarrollo y lo guarda en `.data/initial-access.txt`. Consulta ese archivo en tu equipo; no lo publiques ni lo subas a GitHub. Al usar una base remota, el script exige `ADMIN_EMAIL` y `ADMIN_PASSWORD`, aunque no se haya definido `NODE_ENV`. El script no reemplaza cuentas existentes: si ya creaste el administrador, utiliza el acceso guardado o la recuperación de contraseña.

No necesitas crear `.env.local` para probar el catálogo local. Para personalizar el entorno, copia `.env.example` a `.env.local` y configura solo lo necesario. Deja `DATABASE_URL` vacío para PGlite. `DATABASE_SCHEMA` selecciona el esquema y usa `public` por defecto; la instalación remota de esta tienda utiliza `sergod_store` para mantener separado el proyecto anterior. Las migraciones se aplican automáticamente con PGlite; también puedes ejecutarlas con `npm run db:migrate`.

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

La suite de servidor aprobó **64/64 resultados en GitHub Actions**. Comprueba guardado y lectura real con PGlite aislado, publicación, stock y reservas, POS, descuentos calculados por el servidor, límites de preventa, idempotencia, permisos, recuperación de cuenta, firma HMAC, fallos de red, aislamiento de esquemas y separación entre pagos sandbox y producción. También verifica variantes, conservación de metadatos, rechazo de publicaciones con una versión antigua e importaciones con preventas en borrador. Los datos de integración no son contenido real de la tienda.

La verificación adicional con PostgreSQL remoto aprobó **9/9 comprobaciones**, usando tres conexiones simultáneas y un esquema temporal eliminado al finalizar. Cubre competencia checkout/POS, cupos, callbacks duplicados, rollback y persistencia tras reconectar. Flow estuvo simulado y no se envió correo: **no equivale a un pago realizado en Flow sandbox**. Consulta el [script reproducible](scripts/verify-postgres.md) y el [registro de comprobación](docs/VERIFICATION.md).

```sh
npm run typecheck
npm test
npm run build
```

Los **nueve recorridos de navegador** cubren artículos, preventas, POS/inventario, cuenta/permisos, configuración, publicaciones, 18 rutas en computador/celular, carrito y familias con variantes. Incluyen subida y optimización real de imágenes, recarga, edición, retirada pública, filtros, vista rápida y selección del SKU correcto. Usan una compilación de producción y una base aislada. Consulta las ejecuciones y resultados en el [registro de comprobación](docs/VERIFICATION.md).

Las pruebas de navegador requieren Chrome instalado. Para usar el Chromium de Playwright, instálalo con `npx playwright install chromium` y establece `PLAYWRIGHT_CHANNEL=chromium`. La suite usa el puerto 3100, `.next-e2e` y `.data/e2e`; la tienda principal puede permanecer abierta en el puerto 3000. [GitHub Actions aprobó el flujo completo con variantes e importación mixta](https://github.com/sergodstore-commits/WEBPAGE-v4/actions/runs/36346595302): tipos, 64 resultados de servidor, compilación y nueve recorridos con Chromium. La construcción usa Webpack y comprueba las dependencias del artefacto para evitar paquetes incompletos de servidor.

## Persistencia y publicación

En desarrollo, `.data/postgres` contiene la base, `.data/objects` las imágenes y `.data/initial-access.txt` el acceso inicial local. La sesión de cliente se conserva mediante una cookie del servidor. El navegador almacena únicamente IDs y cantidades del carrito, no el catálogo ni el stock.

La preparación remota ya conectó Supabase: cinco migraciones y el administrador están en el esquema privado `sergod_store`, y las fotografías se guardan en el bucket público `product-images`. Las tablas del proyecto anterior en `public` permanecen intactas; no se trasladó su contenido ni las cuentas antiguas. El catálogo Zero Mulligan está publicado con 12 familias, 72 variantes y 77 imágenes propias. Se creó con stock cero y precios PVP de referencia editables: revisa precios y carga cantidades reales desde el panel. La importación específica está documentada; no es una migración general de datos locales a servicios remotos.

La selección adicional Yu-Gi-Oh! y Mitos y Leyendas suma 16 artículos y 25 imágenes: 11 publicados y cinco preventas en borrador. La tienda pública reúne ahora 16 familias y 83 presentaciones. Primer Bloque y Primera Era permanecen separados, con un sobre de $2.500 cada uno. Todos se cargaron con stock cero para que el propietario ingrese cantidades reales; las preventas requieren completar sus datos comerciales antes de publicarse.

La rama principal de GitHub contiene el nuevo proyecto y Vercel lo sirve en el dominio. El código anterior permanece en el historial y en la etiqueta `legacy-before-rebuild-20260925`. Las claves de `s/` y los archivos privados quedan excluidos de Git y del despliegue. Supabase Cron llama a la conciliación cada minuto, con el secreto en Vault; no se contrató otro plan.

En la web publicada se comprobaron imágenes, productos/preventas y persistencia. Flow sandbox completó casos aprobado, rechazado y expirado: un solo descuento de stock y ningún correo duplicado al repetir callbacks. También se verificaron registro, verificación de correo, recuperación de contraseña y revocación de sesiones con una cuenta autorizada. Resend aceptó seis mensajes de pedidos y dos de cuenta; esto no certifica su llegada a la bandeja de entrada. Los artículos técnicos quedaron retirados y la importación del catálogo conservó sus registros. Se conservaron dirección, horario y contacto publicados del local anterior. Consulta el estado y los límites de las pruebas en [VERIFICATION.md](docs/VERIFICATION.md).

- [Despliegue, variables de entorno, cron y respaldos](docs/DEPLOYMENT.md)
- [Arquitectura y reglas del sistema](docs/ARCHITECTURE.md)
- [Prueba real de Flow sandbox](docs/FLOW-SANDBOX.md)
- [Catálogo Zero Mulligan: variantes, existencias e importación](docs/CATALOG-IMPORT.md)
- [Selección Yu-Gi-Oh! y Mitos y Leyendas: formatos, precios y preventas pendientes](docs/SELECTED-TCG.md)

La aplicación tiene autenticación propia con sesiones de PostgreSQL. **No utiliza Supabase Auth.** Las claves de base de datos, Storage, correo y Flow pertenecen exclusivamente al servidor y no deben llevar el prefijo `NEXT_PUBLIC_`.
