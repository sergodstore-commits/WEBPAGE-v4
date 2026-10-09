# Fondos ampliados de los banners

Generados con la herramienta integrada de imágenes. Las cinco versiones finales usan 1800 × 600 px (3:1), con títulos HTML fuera de la imagen. Los archivos originales se conservan.

Archivos finales: `public/art/banners/{store,preorder,news,community,tournaments}-wide.webp`.

Se generaron fondos a partir de lienzos preparados con las escenas originales. En Preventas, Noticias, Comunidad y Torneos se recompuso la escena original sobre el fondo generado y se suavizó únicamente su unión con el fondo. Tienda recibió además las correcciones autorizadas: DESTINO, display abierto de Beyond the Brave y reducción aproximada del 70 % de plantas decorativas. Las flores de los personajes se conservan.

## Prompts utilizados

### bannerPromptStore

Use case: precise-object-edit, background outpainting. Edit target: the supplied 1800x600 panorama. Fill ONLY the white empty side strips by extending the same warmly lit illustrated card-shop interior, shelves, wooden counters and hanging lamps. Output an extremely wide 3:1 landscape banner with the exact same composition and scale. Preserve every central pixel as closely as possible: the annoyed Dark Magician Girl pointing at the laughing white-bearded Zeus, Dark Magician behind her, the three laughing women, the laugh symbols and the products on the shelves. No people or product additions. Do not zoom, recrop, shrink, redraw faces, modify jokes or packaging. No titles, borders, blur or white panels. Fill only the surrounding empty canvas with seamless new shop background.

### bannerPromptPreorder

Use case: precise-object-edit, background outpainting. Edit target: the supplied 1800x600 panorama. Fill ONLY the white empty canvas around the existing central illustration with a seamless continuation of the same anime-style nighttime cobblestone street, stone building walls and warm amber lantern illumination. Output an extremely wide 3:1 landscape banner, exactly the same framing and layout as the input. Keep every existing character, pose, facial expression, joke, pack artwork and text unchanged, in the exact same location and scale. Do not zoom, recrop, shrink, rearrange, add people or add packs. Keep the entire original scene visible. No banner title, no frames, no lettering, no blur, no white blank area. The gray bearded merchant opening his coat, the surprised blonde girl and the girl peeking behind the right stone wall must remain unchanged; only extend the setting left and right and fill the small pale triangular void on the left.

### bannerPromptNews

Use case: precise-object-edit, background outpainting. Edit target: supplied 1800x600 panorama. Fill ONLY the white empty margins and pale left triangle with a seamless continuation of this warmly lit illustrated tavern/card-shop. Deliver exactly 3:1 wide panorama, retaining the original central composition, size and locations. Preserve the central characters unchanged: shocked Dark Magician Girl reading the newspaper labeled 'banlist', collapsed purple Dark Magician with Kuriboh, laughing Zeus and three laughing women. Keep expressions, newspaper lettering, laugh symbols, hands and all jokes. No new people, no zoom/crop/stretch, no altered characters, no extra text, no white margins, no frames, no blur. Extend only the existing background/counter into the empty regions.

### bannerPromptCommunity

Use case: precise-object-edit, background outpainting. Edit target: supplied 1800x600 panorama. Replace ONLY the remaining white blank strips and pale void at left with continuation of the same colorful anime group selfie scene and blue/purple environment. Exactly 3:1 landscape banner. Keep all original characters and their placements, poses, faces, hands, colors, outfits and joyful expressions unchanged. Preserve the pink-haired girl, red-haired woman, Dark Magician Girl and Dark Magician, laughing Zeus, leafy-haired woman, black-haired woman, blonde woman and Kuriboh. Keep every character and visual joke fully visible. Do not crop, zoom, shrink, add people, modify faces, introduce text, borders, blur or empty white panels. Only complete the background margins seamlessly.

### bannerPromptTournaments

Use case: precise-object-edit, background outpainting. Edit target: supplied 1800x600 panorama. Fill ONLY the white empty side margins by extending the magical anime duel atmosphere: purple lightning, amber magical energy, scattered trading cards and atmospheric dark blue background. Output exactly a 3:1 wide landscape panorama, same scale, same central composition. Preserve all original fighters, faces, expressions, poses, costumes, hands, cards, treasure and red anger symbols unchanged. Keep the muscular man dressed as Dark Magician Girl, Dark Magician, golden-haired woman, green-haired Egyptian fighter, angry white-haired fighter, red-haired angry fighter and treasure-loving crowned king fully visible. No zoom, crop, stretch, rearrangement, new people, text, titles, borders, white voids or blur. Extend only the surrounding setting and energy.

### bannerPromptStoreCorrections

Use case: precise-object-edit. Image 1 is the EDIT TARGET, the completed wide 3:1 card-shop banner. Image 2 is a PRODUCT REFERENCE ONLY. Make only these three changes to image 1: (1) correct the teal product on the upper-right shelf so its bold white name reads exactly 'DESTINO', D E S T I N O, replacing RESTINO; (2) replace the upright closed Beyond the Brave package immediately to its right with an OPEN 24-booster DISPLAY BOX matching image 2: low rectangular black/red tray, visible packs, tall rounded Joey Wheeler and black dragon backing card, Yu-Gi-Oh! and Beyond the Brave branding. It must sit naturally on that same shelf next to DESTINO, small and in perspective, not float or cover characters; (3) remove about 70% of the decorative potted plants and greenery in the room, replacing them with the existing shelves/counter/walls. Remove the foreground lower-left leaves and most shelf pots; leave only about three modest plant clusters. Do NOT remove or change flowers, wreaths or leaves worn by the women. Preserve ALL other pixels as closely as possible: characters, facial expressions, hand poses, the joke of Dark Magician Girl pointing at Zeus, laugh symbols, lamps, background perspective, product boxes FORTUNA and ETERNAL. No new characters or titles, no cropping, zooming, resizing, panel margins or blur. Exact same 3:1 canvas and character placements.
