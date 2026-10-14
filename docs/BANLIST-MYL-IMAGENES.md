# Imágenes de las banlist MyL

Noticias → Banlists muestra imágenes en las fichas de Primera Era y Primer Bloque y permite ampliarlas sin salir de la lista. Conserva búsqueda, filtros, vigencia y restricciones oficiales.

Las referencias de `lib/myl-card-images.ts` se verificaron el 13 de octubre de 2026 contra el catálogo público de TOR, incluyendo ediciones base, expansiones y reimpresiones. No consultan ApiTCG, no escriben datos en Supabase ni duplican imágenes en Storage. El navegador carga las imágenes del servidor oficial `api.myl.cl`, de forma diferida, cuando se acercan a la zona visible. La vista ampliada usa la misma URL. La disponibilidad y el peso de los originales dependen del servidor oficial.

Se verificaron 180 imágenes: 96 de las 112 cartas de Primera Era y 84 de las 86 de Primer Bloque. No se asignaron ilustraciones a las siguientes cartas sin coincidencia segura:

- Primera Era: Dinastía Imperial, Niú Kánzhe Cáodí, Yanhua, Monte del Buitre, Hwandudaedo, Pihuchén, Changquan, Bestias Furiosas, Rapto de Idunn, Titania, Forma Voladora, Xi You Ji, Campeones de Oriente, Nodachi, Cazadores Implacables y Mosquete Puritano.
- Primer Bloque: Kamose el Guerrero y Lady Calvaur.

Estas cartas mantienen nombre, edición y restricción, con el aviso «Imagen pendiente de verificar». Si una imagen remota falla, se indica «Imagen no disponible» y se conserva la ficha. No se sustituye por una carta de nombre parecido ni de otro formato.

La actualización diaria de las restricciones continúa usando las fuentes oficiales existentes. Este índice es una referencia de imágenes, no una fuente de límites o legalidad. Las cartas nuevas que todavía no estén en el índice requieren verificar y añadir su referencia; sus restricciones siguen visibles mientras tanto.

Validación: siete pruebas de restricciones, contenidos e imágenes y TypeScript sin errores. La comprobación de producción verifica carga y ampliación en el navegador. No se modifica el cron, la importación de noticias, los puntos ni el catálogo de productos.
