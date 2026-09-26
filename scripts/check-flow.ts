import { loadEnvConfig } from '@next/env';
import { createHmac } from 'node:crypto';

loadEnvConfig(process.cwd());

async function main() {
  if (!process.env.FLOW_API_KEY && !process.env.FLOW_SECRET_KEY) {
    console.log('Flow sin configurar: no se consulta el proveedor.');
    return;
  }
  if (!process.env.FLOW_API_KEY || !process.env.FLOW_SECRET_KEY)
    throw new Error('Configura ambas claves de Flow para verificar la conexión.');
  if (!['sandbox', 'production'].includes(process.env.FLOW_ENV || 'sandbox'))
    throw new Error('FLOW_ENV no es válido.');
  const environment = process.env.FLOW_ENV || 'sandbox';
  const origin = environment === 'production' ? 'https://www.flow.cl' : 'https://sandbox.flow.cl';
  const params: Record<string, string> = {
    apiKey: process.env.FLOW_API_KEY,
    date: new Date().toISOString().slice(0, 10),
    limit: '1',
  };
  const signature = createHmac('sha256', process.env.FLOW_SECRET_KEY)
    .update(
      Object.keys(params)
        .sort()
        .map((key) => key + params[key])
        .join(''),
    )
    .digest('hex');
  // Read-only endpoint; never create a payment or print credentials/payment data.
  // Contract: https://developers.flow.cl/api (payment/getPayments).
  let response: Response;
  try {
    response = await fetch(
      `${origin}/api/payment/getPayments?${new URLSearchParams({ ...params, s: signature })}`,
      {
        signal: AbortSignal.timeout(15000),
        redirect: 'error',
      },
    );
  } catch {
    throw new Error('No se pudo conectar con Flow. No se creó ningún pago.');
  }
  if (!response.ok)
    throw new Error(
      `Flow no validó la consulta de conexión (HTTP ${response.status}). Revisa las claves del ambiente seleccionado.`,
    );
  let result: any;
  try {
    result = await response.json();
  } catch {
    throw new Error('Flow respondió con un formato no válido.');
  }
  if (!result || !Number.isFinite(Number(result.total)) || !('data' in result))
    throw new Error('Flow respondió sin la estructura esperada.');
  console.log(
    `Flow ${environment}: autenticación y consulta de solo lectura correctas (HTTP 200). No se creó ningún pago.`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'No se pudo verificar Flow.');
  process.exitCode = 1;
});
