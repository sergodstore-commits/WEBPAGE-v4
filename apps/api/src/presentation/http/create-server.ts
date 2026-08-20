import {
  createServer as createNodeServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';

import { setSecurityHeaders } from './http-utils.js';

const HEALTH_RESPONSE = JSON.stringify({ status: 'ok' });
const NOT_FOUND_RESPONSE = JSON.stringify({ error: 'not_found' });

export interface HttpRouteHandler {
  handle(request: IncomingMessage, response: ServerResponse): Promise<boolean>;
}

export class CompositeHttpRouteHandler implements HttpRouteHandler {
  constructor(private readonly handlers: readonly HttpRouteHandler[]) {}

  async handle(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
    for (const handler of this.handlers) {
      if (await handler.handle(request, response)) return true;
    }
    return false;
  }
}

export function createServer(
  routeHandler?: HttpRouteHandler,
  options: { readonly allowedOrigins?: readonly string[] } = {},
): Server {
  return createNodeServer((request, response) => {
    setSecurityHeaders(response);
    if (!applyCors(request, response, options.allowedOrigins ?? [])) return;
    request.setTimeout(15_000, () => {
      if (!response.headersSent) {
        response.writeHead(408, { 'cache-control': 'no-store' });
        response.end();
      }
      request.destroy();
    });
    if (request.method === 'GET' && request.url === '/health') {
      response.writeHead(200, {
        'cache-control': 'no-store',
        'content-type': 'application/json; charset=utf-8',
      });
      response.end(HEALTH_RESPONSE);
      return;
    }

    if (routeHandler !== undefined) {
      void routeHandler
        .handle(request, response)
        .then((handled) => {
          if (!handled) sendNotFound(response);
        })
        .catch(() => sendInternalError(response));
      return;
    }

    if (request.url?.startsWith('/api/v1/')) {
      response.writeHead(503, {
        'cache-control': 'no-store',
        'content-type': 'application/json; charset=utf-8',
      });
      response.end(JSON.stringify({ error: 'identity_access_not_configured' }));
      return;
    }

    sendNotFound(response);
  });
}

function applyCors(
  request: IncomingMessage,
  response: ServerResponse,
  allowedOrigins: readonly string[],
): boolean {
  const origin = request.headers.origin;
  if (origin !== undefined) {
    if (!allowedOrigins.includes(origin)) {
      response.writeHead(403, { 'cache-control': 'no-store' });
      response.end();
      return false;
    }
    response.setHeader('access-control-allow-origin', origin);
    response.setHeader('vary', 'origin');
  }
  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'access-control-allow-headers': 'authorization,content-type,idempotency-key',
      'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'access-control-max-age': '600',
    });
    response.end();
    return false;
  }
  return true;
}

function sendInternalError(response: ServerResponse): void {
  if (!response.headersSent) {
    response.writeHead(500, {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
    });
    response.end(JSON.stringify({ error: 'internal_error' }));
  }
}

function sendNotFound(response: ServerResponse): void {
  if (!response.headersSent) {
    response.writeHead(404, {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
    });
    response.end(NOT_FOUND_RESPONSE);
  }
}
