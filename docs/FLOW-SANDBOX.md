# Validación de pagos Flow

El código de la tienda crea y consulta pagos desde el servidor. Una notificación o el retorno del navegador solo aporta un token: el servidor consulta Flow y coteja orden, monto y moneda antes de confirmar. Las pruebas locales inyectan una respuesta previamente verificada para comprobar las reglas de pedidos e inventario; **no constituyen una prueba de pago en Flow sandbox**.

## Estado de comprobación

Se probó contra **Flow sandbox real** en `https://www.sergodstore.cl`, con el código funcional `87d7566`, entre el 25 y 26 de septiembre de 2026. Hubo creación desde el servidor, reserva de stock, simulación aprobada y rechazada en Flow, retorno POST, consulta directa al proveedor y notificaciones repetidas. No hubo cobros de dinero real. Los artículos técnicos quedaron retirados; los pedidos se conservan como evidencia.

## Contrato consultado

- Sandbox usa `https://sandbox.flow.cl/api`; producción usa `https://www.flow.cl/api`.
- `POST /payment/create` recibe formulario URL-encoded con `apiKey`, `commerceOrder`, `subject`, `amount`, `email`, `urlConfirmation`, `urlReturn` y `s`. La tienda debe enviar `currency=CLP` y `timeout` explícito. La respuesta proporciona `url`, `token` y `flowOrder`. [Creación oficial](https://developers.flow.cl/docs/tutorial-basics/create-order).
- La firma ordena claves alfabéticamente, concatena nombre y valor sin separadores y calcula HMAC-SHA256 hexadecimal con la clave secreta. Se firma antes de codificar el formulario y se excluye `s`. [Quickstart oficial](https://developers.flow.cl/docs/quick-start).
- `GET /payment/getStatus` recibe `apiKey`, `token`, `s`. Los estados son `1` pendiente, `2` pagada, `3` rechazada y `4` anulada. [Estados oficiales](https://developers.flow.cl/docs/tutorial-basics/status).
- `/payment/getStatusByCommerceId` recibe `commerceId`, no `commerceOrder`; permite conciliar una creación cuya respuesta se perdió. `timeout` limita vigencia desde creación. `checkout_timeout` solo limita la selección de medio. No se encontró un endpoint de cancelación de pagos pendientes en la referencia consultada. [Referencia API](https://developers.flow.cl/api).
- Confirmación: POST de formulario con token, sin sesión del cliente. Debe responder HTTP 200 antes de 15 segundos. La documentación no garantiza reintentos automáticos: se necesita conciliación periódica. El pago conserva su resultado aunque falle el callback. [Confirmación oficial](https://developers.flow.cl/docs/tutorial-basics/order-confirmation).
- Retorno: también POST, mediante navegador. Consultar estado y redirigir a la página del pedido. La llegada del comprador puede preceder al pago en métodos asíncronos. [Finalización oficial](https://developers.flow.cl/docs/tutorial-basics/order-finished).

## Preparación

1. Crear/configurar la cuenta sandbox de Flow. Guardar API key y secret key únicamente en variables de entorno del servidor, usando los nombres vigentes de `.env.example`.
2. Publicar una instancia revisable con PostgreSQL, almacenamiento y correo configurados. Usar la base URL pública exacta en la configuración de la aplicación. No activar pagos de producción durante este protocolo.
3. Configurar datos del local, un transportista habilitado y duración de reserva. Crear desde el panel un producto de prueba con tres unidades y una preventa abierta con cupo tres y máximo uno por cliente.
4. Registrar y verificar dos clientes usando los correos recibidos. Comprobar que el correo no verificado no puede reservar.
5. Confirmar que el proveedor puede alcanzar las rutas de callback y retorno y que la ejecución programada de conciliación está activa.

Flow publica una tarjeta chilena de prueba: `4051885600446623`, vencimiento `11/27`, CVV `123`. Para la simulación bancaria: RUT `11111111-1`, clave `123`. Estos valores son públicos de sandbox; no son claves de integración. Verificar su vigencia antes de usarlos. [Credenciales oficiales](https://developers.flow.cl/docs/credentials).

## Recorridos y resultados exigidos

| Caso                              | Comprobación                                                                                                                                                                                                                                       |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pago aprobado con retiro          | Se crea un pedido pendiente y reserva una unidad. Flow recibe el total calculado por servidor. Tras verificar estado 2, pedido aprobado, reserva consumida y stock descontado una sola vez. Se conserva dirección/horario/instrucciones de retiro. |
| Pago aprobado con envío por pagar | Se conservan destinatario, teléfono, comuna y dirección/agencia según modalidad. Se informa flete separado; Flow no cobra ese flete.                                                                                                               |
| Pago rechazado/anulado            | Estado comprensible al cliente; no se confirma ni despacha; se libera la reserva una sola vez tras verificar resultado.                                                                                                                            |
| Comprador cierra el navegador     | El callback o conciliación actualiza el pedido sin depender del retorno.                                                                                                                                                                           |
| Retorno antes del callback        | La página muestra pendiente o el estado que devuelve Flow; nunca presupone éxito.                                                                                                                                                                  |
| Callback repetido y concurrente   | Reenviar el mismo token varias veces mientras se consulta el pedido; un solo descuento, evento de aprobación y correo.                                                                                                                             |
| Reserva vencida                   | Se consulta Flow antes de liberar. Un error de red deja el estado pendiente de conciliación. No liberar basándose únicamente en el reloj local.                                                                                                    |
| Creación con respuesta perdida    | Conciliar por commerceId. No crear automáticamente otro pago ni abandonar una reserva posiblemente pagable.                                                                                                                                        |
| Pago tardío                       | Si ya no hay reserva/stock, registrar revisión administrativa e impedir despacho; nunca stock negativo.                                                                                                                                            |
| Preventa                          | Dos compras simultáneas no superan cupo ni límite acumulado del cliente. Repetir después de aprobar la primera compra.                                                                                                                             |
| POS durante pago pendiente        | La venta física no puede consumir una unidad reservada online. El ticket conserva precio, cantidades, medio, recibido y cambio.                                                                                                                    |
| Integridad del pago               | Monto, moneda, orden comercial o Flow order distintos no confirman el pedido.                                                                                                                                                                      |
| Entrega                           | Preparar, marcar listo o enviado, registrar transportista y seguimiento; comprobar cada cambio desde la cuenta del comprador.                                                                                                                      |
| Correo                            | Recibir aviso de pedido/pago y comprobar recuperación de un fallo transitorio sin duplicar la operación comercial.                                                                                                                                 |

## Pruebas locales automatizadas

Ejecutar `npm test`. `tests/store.test.ts` crea una base PGlite aislada, ejecuta las migraciones SQL vigentes, lee/escribe registros reales y elimina solo su directorio temporal al finalizar. Nunca utiliza `DATABASE_URL` ni SMTP de la sesión que lo ejecuta. Cubre inventario concurrente, POS, límites, fechas, idempotencia, persistencia, precios de servidor, autorización y recuperación de cuenta.

Las imágenes de esa suite son referencias insertadas como fixtures; la subida y optimización reales se comprueban en el recorrido de navegador: crear artículo → subir imagen → publicar → verlo como cliente → recargar → editar → volver a comprobar → retirar. Repetir para Tienda y Preventas. Verificar también cambio de portada y que borrar artículos vendidos conserve el historial.

PGlite ejecuta PostgreSQL embebido y serializa su conexión. La prueba de concurrencia comprueba invariantes de la aplicación, pero **no sustituye la prueba contra PostgreSQL remoto con varias conexiones**. Antes de habilitar producción, repetir checkout/POS y callbacks simultáneos contra la instancia revisable y verificar bloqueos, transacciones e índices únicos.

## Registro de cierre

| Fecha / versión | Ambiente     | Caso               | Pedido / Flow order | Resultado y evidencia                                  |
| --------------- | ------------ | ------------------ | ------------------- | ------------------------------------------------------ |
| 25–26/09/2026 · `87d7566` | Flow sandbox real | Expiración | Pedido #1 / 10660782 | Estado Flow 4 verificado, pedido `expired`, reserva liberada. La ejecución se interrumpió antes de pagar. |
| 26/09/2026 · `87d7566` | Flow sandbox real | Aprobación con retiro | Pedido #2 / consultar panel | $1.000 CLP, pendiente → aprobado; stock 3 → 2 y reserva 1 → 0. Retorno a detalle de pedido. |
| 26/09/2026 · `87d7566` | Flow sandbox real | Cuatro callbacks repetidos | Pedido #2 | HTTP 200; un movimiento de inventario de −1 y un correo de aprobación; retorno repetido HTTP 303. |
| 26/09/2026 · `87d7566` | Flow sandbox real | Rechazo | Pedido #3 / 10661466 | Estado Flow 3; pedido `rejected`, stock 2 y reserva 0. |

Se comprobaron seis mensajes transaccionales aceptados por SMTP, sin duplicados de evento. Esto no asegura llegada a la bandeja de entrada. El cron por minuto está activo en Supabase y respondió HTTP 200.

Después de este cierre, el propietario autorizó producción el 26/09/2026. Las claves se guardaron en Vercel y la migración 004 identifica estos tres pedidos como pruebas sandbox, conservando su historial y excluyéndolos de métricas comerciales. No se realizó un cobro de dinero real durante la activación. El estado vigente está en [VERIFICATION.md](VERIFICATION.md).

Los escenarios de importe manipulado, creación incierta, pagos tardíos, competencia POS/checkout y flete por pagar cuentan con pruebas controladas de servidor (incluyendo PostgreSQL remoto); no se forzaron fallos de red ni pagos tardíos reales del proveedor. El pago real de sandbox se realizó con retiro; repetir con los transportistas comerciales definitivos antes de habilitar envíos. Mantener `FLOW_ENV=sandbox` hasta la decisión explícita de abrir cobros reales y configurar credenciales de producción.

No marcar esta validación como aprobada por un mock, una captura de pantalla del retorno o una prueba local aislada.
