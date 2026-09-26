# Verificación con PostgreSQL remoto

Con las variables privadas `DATABASE_URL`, `DATABASE_SSL=true` y, si corresponde, `DATABASE_SSL_CA` configuradas en el proceso o `.env.local`:

```powershell
node --import tsx scripts/verify-postgres.ts
```

El rol necesita crear y eliminar su propio esquema. El script ignora `DATABASE_SCHEMA` y genera un nombre impredecible `sergod_verify_` seguido de 32 caracteres hexadecimales. Nunca reutiliza `public`, `sergod_store` ni un esquema existente. Solo la base PostgreSQL recibe conexiones reales; Flow se sustituye por respuestas en memoria, SMTP se deshabilita y no se llama a Storage.

Comprueba migraciones idempotentes, tres conexiones PostgreSQL simultáneas con esquema correcto, veinte checkouts sobre una última unidad, diez callbacks duplicados, seis carreras POS/web, máximo de preventa por cliente, idempotencia y cambio del POS, rollback y persistencia tras cerrar y reabrir las conexiones. Las imágenes son referencias de prueba, sin archivos externos. No certifica Flow, SMTP o Storage reales.

El resultado muestra cada comprobación y un resumen sin credenciales. Un `finally` cierra las conexiones y elimina únicamente el esquema creado por esta ejecución, después de validar nombre exacto y marcador de propiedad. El éxito completo incluye `Limpieza verificada`. Una interrupción forzada del proceso o pérdida de conexión puede impedir esa limpieza; el nombre temporal se imprime al inicio para revisarlo de forma explícita, sin borrar esquemas por patrón.
