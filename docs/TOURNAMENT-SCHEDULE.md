# Agenda de torneos

La migración `013_tournament_schedule.sql` agrega a las publicaciones de Torneos inscripción opcional, repetición semanal, cierre opcional y fechas excepcionales. No modifica inventario, ventas, rankings ni transmisiones.

## Panel

En **Admin → Torneos → Nuevo evento**, indicar título, fecha/hora de Chile, lugar, precio opcional y estado. **Programación → Todas las semanas, el mismo día** mantiene el día y horario semanalmente. Sin fecha de cierre, continúa hasta que el administrador retire la programación. Volver a Publicado la reactiva.

Para cancelar un día, elegir **Fecha excepcional → Omitir esta fecha** y guardar. Para cambiar sus detalles u horario, elegir **Editar solo esta fecha**, completar el evento y publicar. El servidor excluye la fecha habitual y publica su reemplazo en una única transacción. Guardar el reemplazo en borrador conserva la fecha habitual hasta publicarlo. Las otras semanas conservan la programación. Un reemplazo puede moverse a otro día. El panel identifica las excepciones y permite editarlas como eventos individuales.

Retirar una programación pausa sus fechas habituales; los eventos especiales guardados de forma individual conservan su estado propio. Borrar un reemplazo no restaura automáticamente la fecha habitual: queda omitida hasta restaurarla explícitamente en la programación.

Precio vacío significa que no se muestra un importe. Cero es un importe explícito; no se convierte vacío en cero. Los precios se muestran en el detalle del día y en la página del evento.

## Lectura y zona horaria

Las repeticiones se guardan como una programación, sin crear miles de filas. La lectura pública materializa únicamente las fechas del intervalo solicitado; cada fecha tiene un enlace estable `slug--on-AAAA-MM-DD`. La agenda solicita el mes seleccionado mediante `/api/posts?kind=tournament&from=AAAA-MM-DD&to=AAAA-MM-DD`. El servidor valida fechas y limita el intervalo a 366 días. La portada usa una ventana móvil con los próximos doce meses.

Todos los horarios se interpretan con `America/Santiago`; una repetición conserva la hora local cuando cambia el horario de invierno. Horas inexistentes por cambio de reloj se rechazan con un mensaje específico. Retirar o excluir una fecha impide consultar su enlace público. Los endpoints de escritura mantienen autenticación administrativa y protección de origen.

## Programación solicitada el 8 de octubre de 2026

| Día       | Evento                 | Hora de Chile | Inscripción visible |
| --------- | ---------------------- | ------------- | ------------------- |
| Martes    | Liga MyL Primera Era   | 19:30         | $6.000              |
| Miércoles | Yu-Gi-Oh!              | 17:30         | Sin importe         |
| Jueves    | Casual MyL Primera Era | 19:30         | $5.000              |
| Viernes   | Liga MyL Primer Bloque | 20:20         | $6.000              |
| Sábado    | Yu-Gi-Oh!              | 17:30         | Sin importe         |

Excepciones de octubre:

- Sábado 10, 13:00: Last Chance; precio pendiente, sin importe visible.
- Sábado 10, 17:30: Beyond the Brave, $25.000; reemplaza el habitual de esa hora.
- Martes 20, 19:30: Sellado Tinieblas × Abismo Primera Era; precio pendiente, sin importe visible.
- Jueves 22, 19:30: Liga Primera Era trasladada desde el martes 20, $6.000; reemplaza el casual.

## Verificación

`tests/tournament-schedule.test.ts` comprueba guardado y reapertura reales en una base aislada, expansión semanal, precio opcional, excepciones sin duplicados, selección de intervalos, pausa/reactivación, cierre opcional y conservación de horario con cambios estacionales. `tests/e2e/tournaments.spec.ts` recorre publicación administrativa, edición de una sola fecha, recarga pública, pausa y lectura en celular. Los datos comerciales de producción no se usan para estas pruebas.
