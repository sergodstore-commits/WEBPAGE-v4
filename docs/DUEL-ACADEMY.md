# Academia de Duelos

Comunidad mantiene los rankings de MyL Primera Era y Primer Bloque bajo “Puntos de liga”. Yu-Gi-Oh! se presenta como “La Academia de Duelos”, con tres casas automáticas:

- Slifer: menos de 150 puntos.
- Ra: entre 150 y 250 puntos, ambos incluidos.
- Obelisco Azul: más de 250 puntos.

Se utilizan los puntos del ranking vigente, calculados con los torneos seleccionados en Admin/Liga. No existe asignación manual de casas ni un segundo cálculo de puntos. Si cambia la selección o se corrigen resultados, la casa se actualiza al consultar el ranking.

Cada jugador conserva su posición general, incluidos puestos compartidos, y su detalle por torneo. La búsqueda aplica a las tres casas. Los grupos sin jugadores se muestran vacíos, sin datos de ejemplo. MyL conserva su podio y tabla habitual.

No requiere migraciones ni variables de entorno. Pruebas: límites 149/150/250/251, distribución y puestos, búsqueda, detalle, recarga y pantallas de 320, 375 y 1440 px; recorrido real de importación y corrección del ranking existente.
