# Comunidad y Liga SERGOD STORE

Implementación de la fase 3 incluida en la entrega final del 7 de octubre. La migración 009 ya está aplicada en producción. La importación requiere revisión y aprobación del administrador; no se precargan resultados ficticios.

## Funcionamiento

`/comunidad` presenta tres clasificaciones independientes: Mitos Primera Era, Mitos Primer Bloque y Yu-Gi-Oh! Ranking SERGOD STORE. Muestra posición, nombre, torneos jugados y puntos; incluye búsqueda, primeros tres puestos y resultados de cada torneo guardado. Los anuncios publicados de Comunidad siguen disponibles debajo del ranking.

La clasificación suma el standing final de las ligas seleccionadas en **Admin → Liga SERGOD STORE → Ligas que suman en el ranking**. Primera Era y Primer Bloque tienen casillas y guardado independientes: el servidor rechaza una liga de otro ranking. No suma rondas ni aplica un desempate oficial: quienes tienen los mismos puntos comparten posición. Los nombres públicos provienen del reporte del torneo; los identificadores de jugador no se exponen en la API pública.

Marca la primera liga y guarda; al terminar otra, marca ambas y guarda para sumar sus puntos. Puedes seleccionar las cuatro ligas de un ciclo. Para empezar otro, pulsa **Desmarcar todas**, marca las nuevas y **Guardar selección**. Una selección vacía muestra un ranking vacío y conserva todos los resultados históricos. La selección queda en PostgreSQL y permanece al recargar o iniciar sesión de nuevo. Cada ranking público lee sumas y ligas contribuyentes en una única consulta coherente.

La migración `011_league_selection.sql` conserva seleccionadas todas las ligas existentes al actualizar. Las nuevas importaciones de TOR MyL quedan sin marcar hasta que el administrador las seleccione; actualizar un standing conserva su selección. La importación Yu-Gi-Oh! conserva su inclusión inicial existente, con selección editable en el mismo panel.

En **Admin → Liga SERGOD STORE**, el administrador revisa una fuente, previsualiza su standing y confirma **Agregar a Liga**. La vista previa vence a los 15 minutos, pertenece a quien la solicitó y solo puede guardarse una vez. Guardar verifica la revisión vigente; una edición concurrente exige revisar otra vez. La interfaz vuelve a leer el registro administrativo y la clasificación pública antes de confirmar el guardado.

**Actualizar resultados** reemplaza las filas del mismo torneo y recalcula los totales. **Eliminar torneo** elimina su aporte al ranking; no modifica el torneo en el proveedor. Un identificador de torneo solo se guarda una vez por fuente. Para archivos, el mismo standing y fecha tampoco puede importarse con otro nombre. Si excepcionalmente dos torneos legítimos del mismo día tienen idénticos resultados, habrá que revisar ese caso antes de importarlos.

## TOR MyL

La integración parte de la [cartelera pública de la tienda 501](https://torneos.myl.cl/store/tournaments/501/sergod-store-). No solicita usuario, contraseña ni credenciales de organizador.

**Revisar TOR** consulta páginas de candidatos. El adaptador comprueba campos estructurados de tipo Liga, juego Primera Era/Primer Bloque, torneo público y estado Terminado/Reportado. Al previsualizar vuelve a verificar el ID de tienda y del torneo, descubre sus rondas y utiliza la de mayor `sortOrder`, únicamente si está terminada y sin partidas pendientes. El standing de esa ronda ya contiene puntos acumulados: se guarda una sola vez. La identidad estable es `Person.id`, no el ID de inscripción que cambia en cada torneo.

El lector utiliza consultas GraphQL de lectura del sitio público, con contexto anónimo obtenido de sus propios recursos públicos. No ejecuta el JavaScript descargado. Este contrato es interno del sitio TOR, no una API pública documentada para terceros; un cambio del proveedor puede requerir actualizar `lib/server/tor.ts`. Hay límites de respuesta y tiempos de espera. Un fallo de consulta no reemplaza los resultados guardados.

Las visitas públicas leen la base de datos local del sistema, sin consultar TOR. No se importa automáticamente al revisar ni al abrir Comunidad.

Variable nueva: `TOR_STORE_ID=501`. No necesita una clave privada.

## Yu-Gi-Oh!: importación de resultados

No se encontró una fuente pública estable adecuada para obtener el standing completo de los torneos de esta tienda. La documentación oficial de [KCGN](https://www.yugioh-card.com/eu/play/konami-card-game-network-kcgn/) describe consulta de resultados y ranking de participación mediante KONAMI ID. Por ello se implementó la alternativa de archivo autorizada, sin solicitar acceso OTS ni credenciales Konami. Esto no afirma que todos los resultados de eventos de Konami sean privados.

El propietario confirmó que Konami exporta los resultados en un archivo Excel. Falta recibir una muestra para identificar extensión, hojas, encabezados, puntos e identidad del jugador; todavía no se considera compatible su archivo nativo. El importador actual permite pegar una tabla tabulada copiada de Excel o cargar CSV/TSV con los encabezados admitidos.

Actualmente se admiten CSV, TSV y texto pegado con separador coma, punto y coma o tabulación. Archivo máximo 500 KB y hasta 5.000 jugadores. La plantilla está en `/ranking-yugioh-ejemplo.csv` y se descarga desde el panel.

```csv
Posicion,Jugador,Puntos,Konami ID
1,Nombre de jugador,9,identificador-estable
2,Otro jugador,6,otro-identificador
```

Se reconocen encabezados españoles e ingleses, incluyendo `Position`, `Player`, `Points`, `Match Points`, `First Name` y `Last Name`. Jugador y puntos enteros no negativos son obligatorios. Posición e identificador son opcionales. Sin posición se conserva el orden de las filas; sin identificador se agrupa por nombre normalizado y se advierte que un cambio de nombre puede separar a la misma persona. Se recomienda mantener identificadores consistentes en todos los reportes; se guardan como huellas y no se muestran públicamente. No se admiten todavía PDF ni Excel.

El administrador ingresa nombre, fecha e identificador del torneo opcional, sube o pega la tabla y revisa todos los jugadores antes de guardar. Para corregir, debe abrir **Actualizar resultados** del torneo existente, conservando su identificador. La importación no convierte este ranking interno en un ranking oficial Konami.

### Reporte CSV de Konami (8 octubre 2026)

Se admite el formato «Lista de Resultados del Torneo» con una fila inicial que contiene el ID del evento, una fila vacía y los encabezados `Rangos,El ID de Card Game,Nombre de Acceso`. «Ganador» equivale al puesto 1. El ID del evento se toma del archivo; si se escribe otro ID en el formulario se rechaza la discrepancia para evitar duplicar el torneo. Los IDs de jugador conservan sus ceros iniciales y se almacenan como huellas privadas.

Este reporte contiene posiciones, pero no puntos ni fecha. La fecha se ingresa en el panel. Para asignar puntos, el administrador completa **Puntos por posición**, una línea por puesto, por ejemplo `1=10`. Debe definir todos los puestos presentes, con puntos enteros de 0 a 100.000; el ejemplo no se aplica automáticamente. La vista previa explica que los puntos proceden de esa regla y no del CSV. Si el archivo ya trae puntos, la regla debe quedar vacía para conservarlos. Los nombres con `?` se mantienen y generan una advertencia, sin inventar sus caracteres originales.

El archivo real E26-246530 se leyó localmente: 12 jugadores y puestos 1 a 12. Se completó la importación real en producción tras verificar la fecha y los resultados en la sesión autorizada de Konami. No se incluye el archivo ni sus IDs en el repositorio.

## Persistencia y seguridad

Migraciones versionadas: `db/migrations/009_rankings.sql` crea las tablas, restricciones, relaciones y RLS; `011_league_selection.sql` agrega la selección persistente de ligas. Ambas están aplicadas en producción. Para nuevas instalaciones, se aplican con `npm run db:migrate` antes de publicar.

Las escrituras requieren administrador y comprobación de origen; los datos se validan en servidor. La confirmación recibe solo el ID de una vista previa guardada, nunca puntos arbitrarios enviados por el navegador. Los reemplazos y sus resultados se guardan en una transacción; las revisiones y bloqueos evitan duplicar puntos durante solicitudes concurrentes.

Módulos: `lib/rankings.ts` (contratos), `lib/server/tor.ts` (lector externo), `ranking-files.ts` (archivos), `rankings.ts` (persistencia y agregación), `components/admin/LeagueAdmin.tsx` (gestión), `components/store/community/` (vista pública).

## Comprobación de esta fase

Las pruebas de servidor usan base PGlite real y aislada: guardado, reapertura, actualización, eliminación, separación de juegos, expiración, permisos de vista previa, duplicados, concurrencia y conservación de datos ante errores del proveedor. Los contratos TOR automatizados usan respuestas controladas para cubrir distintas cantidades de rondas y standing acumulativo.

Además, el adaptador hizo lecturas reales y anónimas de TOR el 7 de octubre de 2026: Liga Primera Era 59185 (última ronda 4, nueve jugadores) y Liga Primer Bloque 58661 (última ronda 3, cinco jugadores). No se importaron a la base de producción. La evidencia privada local está en `.data/tor-research/verification.json`.

Las pruebas de navegador cubren selección y recarga de cada ranking, búsqueda, paginación, resultados, errores recuperables y lectura adaptable. El recorrido de archivo realiza subida → vista previa → guardado real local → consulta pública → recarga → corrección → eliminación. El flujo visual TOR usa respuestas controladas; su lector externo se comprobó separadamente con TOR real.

Resultado del 7 de octubre: 88/88 pruebas de servidor, TypeScript, compilación de producción y trazado del servidor correctos. Seis recorridos únicos de navegador comprobados, incluidos los cuatro de Comunidad/Liga y regresiones de publicaciones y diseño adaptable. Dos recorridos se repitieron después de precisar selectores de las pruebas. Capturas privadas revisadas en `.data/community-review-20261007`.

Ampliación de selección de ligas: siete pruebas de servidor adicionales comprueban conservación al migrar, separación de rankings, suma de una/dos/cuatro ligas, selección repetida, datos inválidos, cambio de ciclo y reapertura. Cinco recorridos de navegador únicos aprobados: las cuatro regresiones de Comunidad y uno de selección con guardado real local, recarga, pantalla móvil y cambio de ciclo sin borrar resultados. No se importaron resultados de prueba a producción.

Comprobación del formato Konami: 16 pruebas de servidor de rankings/selección aprobadas y un recorrido de navegador con subida CSV → rechazo sin puntos → regla explícita → vista previa → guardado en base real aislada → lectura pública → recarga → corrección → eliminación. Se preservan los ceros de los IDs y no se exponen públicamente. TypeScript y compilación/trazado aprobados. Los datos de navegador son ficticios y no se cargaron en producción.

Regla confirmada por el propietario: 3 puntos por victoria; derrota y doble derrota por tiempo aportan 0. Al pegar la tabla de Konami se reconocen Victoria/Victorias/Wins y el encabezado ID de Card Game. Si no hay columna Puntos, se calcula 3×victorias y se conserva la posición original, incluso con igual puntuación. Una columna Empate distinta de cero se rechaza en ese modo; no se le asignan puntos. El Tie-Breaker no se transforma en puntos. Una tabla con puntos explícitos conserva el flujo anterior. El CSV corto sigue necesitando puntos por posición porque no incluye victorias. La sesión autorizada de Konami confirmó el campo de fecha del evento 10/03/2026, en formato MM/DD/YYYY (otros eventos muestran 09/30/2026 y 09/27/2026). Se guardó como 3 de octubre de 2026; el nombre original November 3 se considera discrepante con ese campo, sin modificarlo en Konami.

Comprobación real: E26-246530, 3 de octubre de 2026, 12 jugadores y puntos 12/9/9/6/6/6/6/6/3/3/3/0. Vista previa validada → guardar → lectura administrativa tras recarga → ranking público tras recarga → detalle con puestos originales 1 a 12. El ranking acumulado comparte posición cuando hay igual puntuación, mientras el detalle conserva los puestos de Konami. No se modificó ningún dato ni reporte en Konami.

### Importación KTS de Konami

Desde un torneo finalizado en Konami, expandir «Descargar el Archivo KTS» y descargar el archivo `.Tournament`. Cargarlo en Admin → Comunidad y rankings → Yu-Gi-Oh!: se prepara automáticamente una vista previa con el ID, la fecha del campo `Date`, los puestos y 3 puntos por cada `Wins`. El campo KTS `Points` contiene el desempate y no se usa como puntuación de la liga. Revisar el título, que puede discrepar de la fecha real, y confirmar. El mismo ID actualiza el torneo existente; no suma una segunda copia. Los torneos seleccionados se acumulan automáticamente.

El servidor valida XML, tamaño, torneo finalizado, fecha, identidades, puestos y victorias; rechaza DTD y entidades. Descarta empleados, sanciones y encuentros, y guarda únicamente el snapshot necesario para el ranking. No guarda la contraseña de Konami ni consulta su cuenta automáticamente. Se mantiene la importación CSV/TSV para otros reportes.
