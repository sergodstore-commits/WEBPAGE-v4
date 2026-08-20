import pino, { type DestinationStream, type Logger } from 'pino';

export function createLogger(level: string, destination?: DestinationStream): Logger {
  return pino(
    {
      base: { service: 'sergod-api' },
      level,
      messageKey: 'message',
      redact: {
        censor: '[REDACTED]',
        paths: [
          'authorization',
          'cookie',
          'credentials',
          'databaseUrl',
          'encryptedPayload',
          'password',
          'secret',
          'token',
          '*.authorization',
          '*.cookie',
          '*.credentials',
          '*.databaseUrl',
          '*.encryptedPayload',
          '*.password',
          '*.secret',
          '*.token',
          'req.headers.authorization',
          'req.headers.cookie',
        ],
      },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    destination,
  );
}
