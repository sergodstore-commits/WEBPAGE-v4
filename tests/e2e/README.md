# E2E remoto

Esta carpeta contiene la especificación ejecutable pendiente de un entorno desplegado. El smoke programable está en `scripts/e2e-smoke.mjs` y se ejecuta con `npm run test:e2e:smoke` usando `E2E_BASE_URL`.

La etapa `04-remote-e2e-hardening` debe agregar aquí los escenarios de navegador autenticado para cliente y roles administrativos. No se acepta una suite contra mocks como sustituto de staging, Flow, Webpay o email reales.
