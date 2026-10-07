# Carrito, cuenta y checkout

Las pantallas se encuentran en `components/store/commerce/Commerce.tsx`, con presentación aislada en `Commerce.module.css`. `StoreApp.tsx` conserva la sesión, configuración y carrito compartidos con el catálogo. Las operaciones siguen utilizando los servicios existentes; esta fase no agrega variables de entorno ni migraciones.

El carrito muestra artículos, cantidad, precio por unidad, importe por artículo, descuentos y disponibilidad. Conserva la persistencia local y bloquea la compra si una unidad, producto o preventa no está disponible. El proceso distingue Carrito, Entrega y revisión, y Pago en Flow. Al cambiar entre los dos primeros pasos, el foco y el desplazamiento llevan al encabezado de la pantalla.

Checkout conserva retiro, domicilio y agencia según los transportistas habilitados. El envío por pagar se explica aparte y no suma flete al pago online. Las tarifas cobradas en la web se suman al elegir la entrega; al volver al carrito, donde la entrega figura «Por elegir», el total vuelve a mostrar solo los productos. El resumen conserva descuentos, total y requisitos de sesión y correo verificado. Los datos de entrega y la vuelta al carrito se bloquean mientras se prepara el pago. El plazo de reserva y sus condiciones se consultan en el resumen.

La cuenta conserva registro, verificación, recuperación, sesión persistente, pedidos/preventas y perfil con datos de entrega e identificadores opcionales Konami/KLU. Los controles de navegación indican su selección. Los enlaces de verificación y recuperación mantienen sus mensajes específicos y acceso para solicitar un nuevo enlace.

El detalle de pedido distingue pago pendiente, aprobado, rechazado, expirado o en revisión, incluyendo reserva liberada pendiente de verificación. Muestra preparación/entrega, seguimiento, importes e historial. El importe se denomina pagado únicamente al aprobarse el pago. La actualización consulta el servicio existente de Flow; solo la aprobación del pedido correspondiente retira del carrito las cantidades compradas.

## Verificación

Los recorridos de `tests/e2e/commerce-design.spec.ts` usan API simulada para comprobar importes, descuentos, las tres modalidades de envío, sesión/verificación/stock insuficiente, validación antes del pago, foco entre pasos, perfil, enlaces inválidos, estados y aprobación del pedido. Comprueban la presentación entre 320 y 1440 px y capturan escritorio y móvil. No son una prueba de pago real con Flow.

Las regresiones de `store.spec.ts` comprueban guardado real local del registro, verificación mediante correo local de prueba, sesión/perfil y carrito; también rechazo de checkout sin Flow configurado, sin pedido o reserva nuevos. `checkout-review.spec.ts` observa que revisar la entrega no envía un pago y que únicamente el botón final envía la solicitud. El recorrido de preventas comprueba idioma, condiciones y límites. Todo utiliza la base aislada `.data/e2e`, sin cambios de producción ni cobros.

Esta fase forma parte de la entrega final del 7 de octubre. La conexión real de Twitch e Instagram se realizará después de publicar, por decisión del propietario. El protocolo y las comprobaciones generales están en `VERIFICATION.md`.
