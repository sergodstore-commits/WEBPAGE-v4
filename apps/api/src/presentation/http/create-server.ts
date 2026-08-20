import {
  createServer as createNodeServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';

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

export function createServer(routeHandler?: HttpRouteHandler): Server {
  return createNodeServer((request, response) => {
    if (request.method === 'GET' && request.url === '/health') {
      response.writeHead(200, {
        'cache-control': 'no-store',
        'content-type': 'application/json; charset=utf-8',
      });
      response.end(HEALTH_RESPONSE);
      return;
    }

    if (routeHandler !== undefined) {
      void routeHandler.handle(request, response).then((handled) => {
        if (!handled) sendNotFound(response);
      });
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

function sendNotFound(response: ServerResponse): void {
  if (!response.headersSent) {
    response.writeHead(404, {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
    });
    response.end(NOT_FOUND_RESPONSE);
  }
}
