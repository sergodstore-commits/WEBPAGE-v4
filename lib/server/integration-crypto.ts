import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { fail } from './core';
export const integrationKeyReady = () =>
  /^[a-fA-F0-9]{64}$/.test(process.env.INTEGRATIONS_ENCRYPTION_KEY || '');
export function sealIntegration(value: unknown) {
  if (!integrationKeyReady())
    fail(503, 'Configura la clave de cifrado de integraciones en el servidor.');
  const iv = randomBytes(12),
    cipher = createCipheriv(
      'aes-256-gcm',
      Buffer.from(process.env.INTEGRATIONS_ENCRYPTION_KEY!, 'hex'),
      iv,
    );
  const data = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}
export function openIntegration<T>(value: string): T {
  try {
    if (!integrationKeyReady()) throw Error();
    const [iv, tag, data] = value.split('.').map((b) => Buffer.from(b, 'base64'));
    const cipher = createDecipheriv(
      'aes-256-gcm',
      Buffer.from(process.env.INTEGRATIONS_ENCRYPTION_KEY!, 'hex'),
      iv,
    );
    cipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([cipher.update(data), cipher.final()]).toString());
  } catch {
    fail(503, 'No se pudo leer la conexión. Revisa la clave de cifrado de integraciones.');
  }
}
