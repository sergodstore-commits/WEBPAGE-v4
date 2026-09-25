# Despliegue y operación

Esta guía describe cómo publicar una instancia revisable en Vercel con PostgreSQL y Storage de Supabase. El repositorio puede guardarse en GitHub cuando se conecte la cuenta correspondiente. Estos pasos requieren cuentas y credenciales propias; el código local no crea servicios, contrata planes ni publica automáticamente la tienda.

Mantén Flow en **sandbox** hasta completar el [protocolo de validación](FLOW-SANDBOX.md). Usar la opción de producción de Vercel para obtener una URL estable no obliga a usar pagos de producción: el entorno de Flow se elige por separado con `FLOW_ENV`.

## 1. Preparar PostgreSQL

1. Crea el proyecto de Supabase destinado a la instancia revisable y obtén su cadena de conexión PostgreSQL desde el panel del proyecto. No uses una clave de la API REST como `DATABASE_URL`.
2. Usa una conexión adecuada para las funciones de Vercel; el pooler de transacciones es la opción prevista para tráfico serverless. Para la ejecución administrativa de migraciones, elige una conexión compatible con tu red y las transacciones SQL. Confirma puertos, usuario y parámetros en el panel de conexión, sin inventar el hostname. Consulta [las modalidades de conexión oficiales de Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres).
3. Configura `DATABASE_URL` como secreto del servidor y `DATABASE_SSL=true`. El cliente exige validación del certificado TLS. Si el proveedor exige una autoridad certificadora propia, guarda su certificado PEM en `DATABASE_SSL_CA`; se admiten saltos de línea reales o `\n`. No soluciones un error de certificado desactivando TLS en producción; revisa la cadena de conexión y la confianza del certificado.
4. Las tablas de la aplicación son privadas para el navegador. Las migraciones habilitan RLS en las tablas de negocio sin políticas públicas. Las consultas pasan por las API autenticadas de Next.js y por una conexión PostgreSQL del servidor con permisos de propietario sobre esas tablas. No expongas la contraseña de ese rol ni crees acceso de escritura para roles `anon` o `authenticated`.

La aplicación **no utiliza Supabase Auth**. Registro, contraseñas, verificación, recuperación y sesiones viven en las tablas propias de PostgreSQL. No hay que configurar proveedores de Supabase Auth para iniciar sesión.

## 2. Preparar las imágenes

1. Crea un bucket público llamado `product-images`, o usa otro nombre y guárdalo en `SUPABASE_STORAGE_BUCKET`.
2. Público significa que las fotografías del catálogo pueden leerse mediante su URL. No habilites políticas de carga, actualización ni borrado anónimo sobre ese bucket.
3. Configura `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` exclusivamente en el servidor. El administrador carga imágenes a la API de la tienda; la API autentica su rol, optimiza con Sharp y escribe al bucket con la clave de servicio. El navegador nunca recibe esa clave.
4. Verifica una carga desde **Nuevo artículo**. Se aceptan JPG, PNG, WebP y AVIF de hasta 4 MB por imagen; el servidor genera WebP de hasta 1600 × 1600 sin ampliar imágenes pequeñas. Las referencias quedan en `uploads` y `products` o `posts`.

El límite de carga de la aplicación se mantiene por debajo del límite de cuerpo de las funciones de Vercel, considerando el formulario. Comprueba los límites efectivos del plan y runtime al publicar, especialmente tamaño de petición, memoria y duración; las rutas API usan Node.js y solicitan `maxDuration=60`. Véanse [los límites de funciones de Vercel](https://vercel.com/docs/functions/limitations).

No uses el disco temporal de Vercel para conservar la base o imágenes. El almacenamiento de archivos bajo `.data` es solo para desarrollo local.

## 3. Preparar el correo y Flow

Configura un proveedor SMTP y un remitente autorizado. En producción, SMTP es necesario para que los clientes puedan verificar su correo, recuperar contraseña y recibir avisos del pedido. La herramienta de correos locales se deshabilita en producción; sin SMTP no existe una bandeja pública alternativa para los clientes.

Para Flow:

- Configura `FLOW_ENV=sandbox`, `FLOW_API_KEY` y `FLOW_SECRET_KEY` de la misma cuenta sandbox.
- Define `APP_URL` con la URL base HTTPS pública exacta, sin ruta y preferentemente sin barra final. Debe coincidir con el origen desde el cual comprarán los usuarios. La URL interviene en enlaces de correo, callbacks y la protección de solicitudes de escritura.
- La creación del pago envía `urlConfirmation=<APP_URL>/api/flow/confirmation` y `urlReturn=<APP_URL>/api/flow/return`. Ambas rutas reciben **POST** de formulario con el token; el servidor consulta Flow antes de confirmar un pedido.
- La confirmación de Flow no depende de una sesión de cliente. El retorno del navegador redirige al detalle del pedido y tampoco se interpreta como pago aprobado por sí solo.
- El proveedor debe poder alcanzar ambos endpoints. Una URL local o una protección de despliegue que exija iniciar sesión en Vercel impide ese acceso. Prepara una instancia revisable accesible al proveedor.

La firma, creación y consulta se implementan en `lib/server/flow.ts`. La fuente del contrato es la [API oficial de Flow](https://developers.flow.cl/api). Sigue [FLOW-SANDBOX.md](FLOW-SANDBOX.md) para comprobar aprobaciones, rechazos, repeticiones, retorno anticipado y conciliación. No cambies a `FLOW_ENV=production` antes de completar esa validación y revisar las credenciales y la URL del ambiente definitivo.

## 4. Aplicar migraciones y crear el administrador

Instala exactamente las dependencias del lockfile con `npm ci`. Desde un equipo o ejecución de CI confiable, configura las variables de la base remota y el entorno de producción antes de ejecutar scripts. En PowerShell:

```powershell
$env:NODE_ENV = 'production'
npm run check:production
npm run db:migrate
npm run admin:create
```

Las variables se pueden proporcionar mediante el gestor de secretos del entorno o un `.env.local` privado en el equipo de operación. `ADMIN_EMAIL` y `ADMIN_PASSWORD` son obligatorias para `admin:create` en producción y siempre que `DATABASE_URL` no esté vacía, aunque `NODE_ENV` no esté definido. La contraseña debe tener entre 12 y 128 caracteres. El script crea un administrador verificado y no imprime la contraseña ni sobrescribe usuarios existentes. Retira estas dos variables al terminar; no son necesarias para ejecutar la web.

`check:production` comprueba presencia y consistencia básica de variables, HTTPS, TLS y longitud del secreto de cron. No abre conexiones ni valida credenciales externas. Permite publicar con Flow deshabilitado si ambas claves están vacías; si se configura una, exige la otra. Un resultado correcto no sustituye las pruebas de conexión, correo, imágenes ni pagos.

Aplica las migraciones **antes del despliegue de la versión que las necesita**. El runtime remoto no migra por defecto. El historial se registra en `schema_migrations`; cada archivo SQL se ejecuta en una transacción y solo una vez. No edites un archivo ya aplicado: agrega una migración versionada nueva.

Los scripts de migración crean las tablas, pero no transportan la información de `.data` a Supabase. **No está implementada una herramienta de migración de datos locales o de imágenes locales a almacenamiento remoto.** Si necesitas trasladar contenido real, prepara y valida un procedimiento específico antes de cambiar el entorno; no basta con copiar `.data` a Vercel.

## 5. Publicar en Vercel

1. Sube el repositorio a GitHub sin `.env.local`, `.data`, credenciales, informes privados ni `node_modules`. Revisa `.gitignore` y el contenido preparado para el commit.
2. Importa el repositorio en Vercel y selecciona Next.js. Usa `npm ci` para instalar y conserva la construcción configurada en `vercel.json`: `npm run check:production && npm run build`. Así se bloquea una publicación con configuración mínima incompleta. No cambies el proyecto a una exportación estática: cuenta, inventario, imágenes y pagos necesitan el servidor.
3. Configura las variables del ambiente correcto. Una revisión y la tienda definitiva deben tener bases y credenciales deliberadamente separadas; no conectes por accidente una vista previa a pedidos de clientes reales.
4. Establece la URL estable en `APP_URL` y vuelve a desplegar si cambia. La aplicación solo acepta escrituras desde ese origen. Ingresar desde otro alias sin configurar no debe considerarse un fallo de sesión.
5. Publica después de aplicar las migraciones. Comprueba `GET /api/health`, carga del inicio, acceso administrativo, lectura/escritura de configuración y carga de imágenes. El endpoint de salud valida acceso a la base; no certifica Flow, SMTP ni Storage.
6. Configura el local y transportistas desde el panel, publica contenido propio y ejecuta los recorridos de navegador. La base inicial no contiene artículos o publicaciones ficticios.

No hay configuración que active automáticamente un plan de pago ni un cron en este repositorio. El operador elige el proveedor y el plan al publicar.

## 6. Programar la conciliación cada minuto

La operación normal necesita invocar **cada minuto**:

```text
GET https://DOMINIO-DE-LA-TIENDA/api/jobs/reconcile
Authorization: Bearer <CRON_SECRET>
```

Usa un secreto aleatorio independiente de al menos 32 caracteres para `CRON_SECRET` y el mismo valor en la aplicación y el programador. La ruta no debe invocarse desde código público del navegador. El trabajo consulta pagos pendientes, procesa vencimientos seguros, intenta enviar correos y limpia sesiones, tokens y límites vencidos.

**El cron de Vercel Hobby permite frecuencia diaria y no satisface esta necesidad.** Para programarlo por minuto, elige un cron externo que pueda enviar el encabezado de autorización, o un plan de Vercel que admita esa frecuencia, como Pro. Consulta [uso y precios oficiales de Vercel Cron Jobs](https://vercel.com/docs/cron-jobs/usage-and-pricing). Esta guía no autoriza contratar ni activar un plan de pago.

Si se elige Vercel Cron en un plan adecuado, agrega una entrada al `vercel.json` del repositorio conservando su framework y comando de construcción:

```json
{
  "framework": "nextjs",
  "buildCommand": "npm run check:production && npm run build",
  "crons": [{ "path": "/api/jobs/reconcile", "schedule": "* * * * *" }]
}
```

Vercel debe tener configurado `CRON_SECRET` para proteger las invocaciones. Verifica su recepción antes de dar por activo el mantenimiento. Con un cron externo, configura explícitamente método, URL, frecuencia y encabezado.

Cada ejecución reclama hasta seis pedidos, consulta Flow en grupos de tres y procesa un lote acotado de correos. Revisa errores y acumulación si aumenta el volumen. Una respuesta HTTP exitosa con `failed > 0` significa que hubo consultas que no se completaron: debe investigarse, no interpretarse como conciliación completa.

La expiración local no presume que un pago posiblemente creado en Flow fue rechazado. Si no se puede confirmar el resultado con el proveedor, la reserva puede permanecer pendiente para evitar vender una unidad ya pagada. La operación necesita revisar pedidos retenidos y restablecer la comunicación; no debe liberar existencias manualmente basándose solo en el reloj.

## Variables de entorno

`.env.example` es la lista de configuración copiable. Ninguna clave privada debe usar `NEXT_PUBLIC_`.

| Variable                    | Desarrollo local                                                                                                            | Instancia publicada                                                                               |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `APP_URL`                   | `http://localhost:3000` por defecto.                                                                                        | URL HTTPS pública exacta. Se usa para origen, correos y callbacks.                                |
| `DATABASE_URL`              | Vacía: PGlite persistente.                                                                                                  | Cadena PostgreSQL del servidor; obligatoria.                                                      |
| `DATABASE_SSL`              | `true`; sin efecto sobre PGlite.                                                                                            | `true` para TLS validado. `false` solo en una base local que lo requiera.                         |
| `DATABASE_SSL_CA`           | Vacía salvo que una conexión remota lo requiera.                                                                            | Certificado CA en formato PEM si lo requiere PostgreSQL; admite `\n`.                             |
| `LOCAL_DATA_DIR`            | `.data`; directorio de base, objetos y acceso inicial.                                                                      | No sustituye PostgreSQL/Storage remotos.                                                          |
| `AUTO_MIGRATE`              | `false`; las migraciones locales siempre se aplican. `true` permite migrar automáticamente un entorno remoto de desarrollo. | Mantener `false`; ejecutar `db:migrate` antes del despliegue.                                     |
| `SUPABASE_URL`              | Opcional; vacía usa imágenes locales.                                                                                       | URL del proyecto Supabase.                                                                        |
| `SUPABASE_SERVICE_ROLE_KEY` | Opcional; solo servidor.                                                                                                    | Clave de servicio para escribir imágenes. Nunca pública.                                          |
| `SUPABASE_STORAGE_BUCKET`   | `product-images`.                                                                                                           | Nombre del bucket público de fotografías sin escritura anónima.                                   |
| `FLOW_ENV`                  | `sandbox`.                                                                                                                  | `sandbox` durante validación; `production` únicamente al habilitar cobros reales.                 |
| `FLOW_API_KEY`              | Vacía bloquea pago online.                                                                                                  | API key del ambiente Flow elegido.                                                                |
| `FLOW_SECRET_KEY`           | Vacía bloquea pago online.                                                                                                  | Secreto HMAC del mismo ambiente Flow.                                                             |
| `SMTP_HOST`                 | Vacía: mensajes en bandeja local privada.                                                                                   | Host SMTP necesario para correo real.                                                             |
| `SMTP_PORT`                 | `587` por defecto.                                                                                                          | Puerto indicado por el proveedor.                                                                 |
| `SMTP_SECURE`               | `false` por defecto.                                                                                                        | `true` para TLS desde el inicio, normalmente puerto 465; con STARTTLS en 587 normalmente `false`. |
| `SMTP_USER`                 | Opcional sin SMTP.                                                                                                          | Usuario SMTP según proveedor.                                                                     |
| `SMTP_PASSWORD`             | Opcional sin SMTP.                                                                                                          | Contraseña o credencial SMTP del servidor.                                                        |
| `MAIL_FROM`                 | Sin envío real si no hay SMTP.                                                                                              | Remitente autorizado por el proveedor de correo.                                                  |
| `CRON_SECRET`               | Solo necesario al invocar mantenimiento.                                                                                    | Secreto compartido con el cron cada minuto.                                                       |
| `ADMIN_EMAIL`               | Opcional para el script de creación.                                                                                        | Correo obligatorio al ejecutar `admin:create`; no es configuración del cliente.                   |
| `ADMIN_PASSWORD`            | Opcional: el script genera una clave local.                                                                                 | Contraseña obligatoria al ejecutar `admin:create`; retirar después del uso.                       |

El código reconoce además controles internos que no forman parte de `.env.example`:

| Control                  | Uso                                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NODE_ENV`               | Lo establece Next.js para desarrollo/producción. Configúralo como `production` al ejecutar scripts administrativos contra el ambiente publicado. |
| `VERCEL`                 | Señal provista por Vercel; activa las restricciones de producción. No simularla en desarrollo.                                                   |
| `NEXT_DIST_DIR`          | Carpeta de construcción; por defecto `.next`. Permite aislar compilaciones de pruebas.                                                           |
| `ALLOW_LOCAL_PRODUCTION` | Excepción explícita para probar una compilación local con PGlite. Solo desarrollo/CI; nunca configurar en Vercel ni en una tienda publicada.     |

## Comprobaciones antes de abrir ventas

- Registro, verificación y recuperación con correo real; persistencia de sesión y separación cliente/administrador.
- Tienda y Preventas: crear desde el panel, subir imagen, cambiar portada, publicar, ver como cliente, recargar, editar, verificar y retirar. Reiniciar la aplicación para comprobar persistencia remota.
- Checkout, callbacks repetidos y estados reales de Flow sandbox; importes CLP, descuentos, unidades reservadas, aprobación, rechazo y vencimientos.
- Concurrencia sobre PostgreSQL remoto con conexiones independientes: checkout y POS no consumen las mismas últimas unidades.
- Retiro con dirección/horario reales; envío a domicilio o agencia; flete por pagar excluido del total Flow; preparación y seguimiento visibles al cliente.
- Cron cada minuto, correo pendiente, reintentos y consulta de pedidos si falla un callback.

El estado local documentado es **40/40 pruebas aprobadas** —38 casos y dos contenedores— y **8/8 recorridos de navegador** sobre una compilación de producción local. La integración real con servicios externos y el recorrido de Flow sandbox siguen pendientes. Consulta [el registro de comprobación](VERIFICATION.md); no debe declararse la tienda lista para cobrar por el solo éxito de la compilación.

## Respaldos y recuperación

**Desarrollo:** detén todos los procesos que utilicen PGlite y copia completa la carpeta indicada por `LOCAL_DATA_DIR`. Incluye tanto `postgres` como `objects`; guarda esa copia en una ubicación privada, porque contiene clientes, sesiones, correos y el acceso inicial. Para restaurar, detén el servidor, conserva una copia del estado actual y recupera el conjunto completo antes de volver a iniciarlo. No abras dos servidores sobre la misma carpeta.

**Producción:** respalda PostgreSQL y los objetos del bucket por separado. Una copia de la base conserva referencias, pero no reemplaza los archivos de imágenes. Conserva la versión del repositorio y las migraciones que corresponden a cada respaldo, y administra las credenciales en un gestor de secretos independiente. Prueba la restauración en un ambiente aislado antes de necesitarla.

Los artículos eliminados se conservan internamente para mantener ventas e inventario consultables. Los objetos de imágenes tampoco tienen un proceso automático de purga. No borres registros u objetos en masa sin verificar las referencias de productos, publicaciones y pedidos históricos.
