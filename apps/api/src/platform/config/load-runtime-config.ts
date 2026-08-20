export interface RuntimeConfig {
  readonly host: string;
  readonly port: number;
}

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = '3000';

export function loadRuntimeConfig(environment: NodeJS.ProcessEnv): RuntimeConfig {
  const host = environment.API_HOST?.trim() || DEFAULT_HOST;
  const portText = environment.API_PORT?.trim() || DEFAULT_PORT;
  const port = Number(portText);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('API_PORT must be an integer between 1 and 65535.');
  }

  return Object.freeze({ host, port });
}
