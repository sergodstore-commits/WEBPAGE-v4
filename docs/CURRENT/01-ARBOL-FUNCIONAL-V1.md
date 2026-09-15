# 01 — Árbol funcional objetivo V1

> Objetivo final. No implica implementación presente ni autoriza anticipar etapas futuras.

```text
SERGOD STORE WEB V1
│
├── 1. EXPERIENCIA PÚBLICA
│   ├── Inicio
│   │   └── Lanzador visual de altura completa
│   │       ├── Logo oficial central
│   │       ├── Tienda
│   │       ├── Preventas
│   │       ├── Torneos
│   │       ├── Noticias
│   │       ├── Comunidad
│   │       ├── Loyalty
│   │       ├── Quests
│   │       └── Cómics / Historias
│   ├── Tienda
│   │   ├── Catálogo
│   │   │   ├── Búsqueda
│   │   │   ├── Filtros
│   │   │   │   ├── Juego
│   │   │   │   ├── Categoría
│   │   │   │   ├── Precio
│   │   │   │   ├── Idioma
│   │   │   │   ├── Edición
│   │   │   │   ├── Condición
│   │   │   │   └── Disponibilidad
│   │   │   └── Ordenamiento
│   │   ├── Producto regular
│   │   │   ├── Galería
│   │   │   ├── Descripción
│   │   │   ├── Precio
│   │   │   ├── Disponibilidad pública
│   │   │   │   ├── Disponible
│   │   │   │   ├── Últimas unidades
│   │   │   │   └── Agotado
│   │   │   ├── Idioma / edición / condición / SKU
│   │   │   └── Agregar al carrito
│   ├── Preventas
│   │   ├── Información y condiciones
│   │   ├── Fecha/ventana estimada
│   │   ├── Cupos / disponibilidad
│   │   ├── Precio
│   │   └── Agregar al carrito
│   ├── Torneos (editorial/informativo)
│   │   ├── Próximos torneos
│   │   ├── Detalle
│   │   ├── Torneos realizados
│   │   ├── Resultados / podio / fotos / resumen
│   │   └── Hall of Fame
│   ├── Quests (editorial/informativo)
│   │   ├── Portada
│   │   └── Detalle
│   ├── Loyalty
│   │   ├── Puntos disponibles y reservados
│   │   └── Movimientos
│   ├── Noticias
│   │   ├── Portada
│   │   ├── Categorías
│   │   └── Artículo
│   ├── Comunidad
│   │   ├── Presentación
│   │   ├── Juegos / actividades
│   │   ├── Torneos / Quests
│   │   ├── WhatsApp / redes
│   │   └── Información local
│   └── Cómics / Historias
│       ├── Portada
│       ├── Series / capítulos
│       └── Lector
│
├── 2. CARRITO Y CHECKOUT
│   ├── Carrito anónimo o autenticado
│   ├── Grupos REGULAR / PREORDER / CONFLICT
│   ├── Cantidades y eliminación de líneas
│   ├── Conflictos explícitos
│   ├── Cupones / promociones / puntos
│   ├── Revalidación y totales de servidor
│   ├── Entrega
│   │   ├── Retiro en tienda
│   │   └── Despacho por pagar a agencia
│   │       ├── Destinatario
│   │       ├── Teléfono
│   │       ├── Región/comuna de destino
│   │       ├── Transportista: Chilexpress o Starken
│   │       └── Agencia/destino
│   ├── Creación idempotente de Order
│   └── Pago Flow
│
├── 3. CUENTA CLIENTE
│   ├── Registro / login / verificación / recuperación
│   ├── Resumen
│   ├── Perfil y contacto
│   ├── Preferencias de despacho
│   ├── Seguridad
│   ├── Pedidos
│   ├── Preventas
│   └── Puntos
│
├── 4. ADMIN
│   ├── Dashboard
│   ├── Catálogo
│   ├── Inventario
│   ├── Pedidos
│   ├── Preventas simplificadas
│   ├── Promociones y cupones
│   ├── Loyalty
│   ├── POS
│   ├── Torneos editoriales
│   ├── Noticias
│   ├── Comunidad / Cómics
│   ├── Usuarios
│   ├── Configuración
│   └── Auditoría
│
├── 5. POS
│   ├── Buscar por producto/SKU
│   ├── Venta anónima o asociada a cuenta
│   ├── Promociones/cupón/puntos
│   ├── Registrar medio recibido
│   │   ├── Efectivo
│   │   ├── Débito
│   │   ├── Crédito
│   │   ├── Transferencia
│   │   └── Otro externo
│   ├── Referencia/nota opcional
│   ├── Confirmar venta
│   ├── Consumir inventario compartido
│   └── Historial / total diario
│
└── 6. TRANSVERSAL
    ├── Auth y ADMIN/CLIENTE
    ├── Auditoría
    ├── Idempotencia
    ├── Outbox / Inbox cuando aplique
    ├── Scheduled jobs
    ├── Configuración versionada
    ├── Storage/imágenes seguro
    ├── Email transaccional
    ├── Payments
    ├── Inventario compartido
    ├── Promociones
    ├── Loyalty
    ├── Observabilidad
    └── Seguridad / backups / rollback
```

## Notas

- No existe sistema genérico de variantes en V1. Idioma, edición, condición y SKU representan productos comerciales diferenciados.
- La disponibilidad pública no expone cantidad exacta; Admin sí puede consultar `on_hand`, `reserved` y `available`.
- Los torneos son contenido editorial, no motor competitivo de rondas/emparejamientos/standings.
