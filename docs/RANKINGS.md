# Comunidad y Liga SERGOD STORE

Implementación de la fase 3 incluida en la entrega final del 7 de octubre. La migración 009 ya está aplicada en producción. La importación requiere revisión y aprobación del administrador; no se precargan resultados ficticios.

## Funcionamiento

`/comunidad` presenta tres clasificaciones independientes: Mitos Primera Era, Mitos Primer Bloque y Yu-Gi-Oh! Ranking SERGOD STORE. Muestra posición, nombre, torneos jugados y puntos; incluye búsqueda, primeros tres puestos y resultados de cada torneo guardado. Los anuncios publicados de Comunidad siguen disponibles debajo del ranking.

La clasificación suma el standing final de cada torneo incorporado. No suma rondas ni aplica un desempate oficial: quienes tienen los mismos puntos comparten posición. Abarca todos los torneos guardados en cada clasificación; no hay temporadas configuradas. Los nombres públicos provienen del reporte del torneo. Los identificadores de jugador no se exponen en la API pública.

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

El formato real que entregará el sistema de torneos todavía es desconocido. Queda pendiente validar una exportación real; no se afirma compatibilidad con un reporte oficial específico.

Actualmente se admiten CSV, TSV y texto pegado con separador coma, punto y coma o tabulación. Archivo máximo 500 KB y hasta 5.000 jugadores. La plantilla está en `/ranking-yugioh-ejemplo.csv` y se descarga desde el panel.

```csv
Posicion,Jugador,Puntos,Konami ID
1,Nombre de jugador,9,identificador-estable
2,Otro jugador,6,otro-identificador
```

Se reconocen encabezados españoles e ingleses, incluyendo `Position`, `Player`, `Points`, `Match Points`, `First Name` y `Last Name`. Jugador y puntos enteros no negativos son obligatorios. Posición e identificador son opcionales. Sin posición se conserva el orden de las filas; sin identificador se agrupa por nombre normalizado y se advierte que un cambio de nombre puede separar a la misma persona. Se recomienda mantener identificadores consistentes en todos los reportes; se guardan como huellas y no se muestran públicamente. No se admiten todavía PDF ni Excel.

El administrador ingresa nombre, fecha e identificador del torneo opcional, sube o pega la tabla y revisa todos los jugadores antes de guardar. Para corregir, debe abrir **Actualizar resultados** del torneo existente, conservando su identificador. La importación no convierte este ranking interno en un ranking oficial Konami.

## Persistencia y seguridad

Migración versionada: `db/migrations/009_rankings.sql`. Crea `league_tournaments`, `league_results` y `league_previews`, con restricciones, claves únicas, relaciones y RLS. Se aplica con el mecanismo habitual `npm run db:migrate` cuando corresponda al despliegue final. No se aplicó a producción en esta fase.

Las escrituras requieren administrador y comprobación de origen; los datos se validan en servidor. La confirmación recibe solo el ID de una vista previa guardada, nunca puntos arbitrarios enviados por el navegador. Los reemplazos y sus resultados se guardan en una transacción; las revisiones y bloqueos evitan duplicar puntos durante solicitudes concurrentes.

Módulos: `lib/rankings.ts` (contratos), `lib/server/tor.ts` (lector externo), `ranking-files.ts` (archivos), `rankings.ts` (persistencia y agregación), `components/admin/LeagueAdmin.tsx` (gestión), `components/store/community/` (vista pública).

## Comprobación de esta fase

Las pruebas de servidor usan base PGlite real y aislada: guardado, reapertura, actualización, eliminación, separación de juegos, expiración, permisos de vista previa, duplicados, concurrencia y conservación de datos ante errores del proveedor. Los contratos TOR automatizados usan respuestas controladas para cubrir distintas cantidades de rondas y standing acumulativo.

Además, el adaptador hizo lecturas reales y anónimas de TOR el 7 de octubre de 2026: Liga Primera Era 59185 (última ronda 4, nueve jugadores) y Liga Primer Bloque 58661 (última ronda 3, cinco jugadores). No se importaron a la base de producción. La evidencia privada local está en `.data/tor-research/verification.json`.

Las pruebas de navegador cubren selección y recarga de cada ranking, búsqueda, paginación, resultados, errores recuperables y lectura adaptable. El recorrido de archivo realiza subida → vista previa → guardado real local → consulta pública → recarga → corrección → eliminación. El flujo visual TOR usa respuestas controladas; su lector externo se comprobó separadamente con TOR real.

Resultado del 7 de octubre: 88/88 pruebas de servidor, TypeScript, compilación de producción y trazado del servidor correctos. Seis recorridos únicos de navegador comprobados, incluidos los cuatro de Comunidad/Liga y regresiones de publicaciones y diseño adaptable. Dos recorridos se repitieron después de precisar selectores de las pruebas. Capturas privadas revisadas en `.data/community-review-20261007`.
