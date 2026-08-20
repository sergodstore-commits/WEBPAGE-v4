import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

const JSON_LIMIT_BYTES = 32 * 1024;

export class HttpRequestError extends Error {
  constructor(
    readonly code: string,
    readonly httpStatus: number,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'HttpRequestError';
  }
}

export async function readJsonBody(
  request: IncomingMessage,
  options: { readonly requireJsonContentType?: boolean } = {},
): Promise<unknown> {
  if (options.requireJsonContentType === true) {
    const contentType = request.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase();
    if (contentType !== 'application/json') {
      throw new HttpRequestError(
        'VALIDATION_FAILED',
        422,
        'Content-Type must be application/json.',
      );
    }
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > JSON_LIMIT_BYTES) {
      throw new HttpRequestError('REQUEST_TOO_LARGE', 413, 'Request is too large.');
    }
    chunks.push(buffer);
  }
  if (size === 0) throw new HttpRequestError('INVALID_JSON', 400, 'Request body must be JSON.');
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch (error) {
    throw new HttpRequestError('INVALID_JSON', 400, 'Request body must be JSON.', { cause: error });
  }
}

export function readBearerToken(request: IncomingMessage): string {
  const authorization = request.headers.authorization;
  if (authorization === undefined || !authorization.startsWith('Bearer ')) {
    throw new HttpRequestError('AUTHENTICATION_REQUIRED', 401, 'Authentication is required.');
  }
  const token = authorization.slice(7).trim();
  if (token === '') {
    throw new HttpRequestError('AUTHENTICATION_REQUIRED', 401, 'Authentication is required.');
  }
  return token;
}

export function readIdempotencyKey(
  request: IncomingMessage,
  options: { readonly maximumLength?: number; readonly visibleAscii?: boolean } = {},
): string {
  const value = request.headers['idempotency-key'];
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (
    normalized === '' ||
    (options.maximumLength !== undefined && normalized.length > options.maximumLength) ||
    (options.visibleAscii === true && !/^[\x21-\x7e]+$/u.test(normalized))
  ) {
    throw new HttpRequestError(
      'IDEMPOTENCY_KEY_REQUIRED',
      422,
      'A valid Idempotency-Key is required.',
    );
  }
  return normalized;
}

export function sendJson(
  response: ServerResponse,
  status: number,
  body?: unknown,
  correlationId?: string,
): true {
  response.statusCode = status;
  response.setHeader('cache-control', 'no-store');
  setSecurityHeaders(response);
  response.setHeader('content-type', 'application/json; charset=utf-8');
  if (correlationId !== undefined) response.setHeader('x-correlation-id', correlationId);
  response.end(body === undefined ? undefined : JSON.stringify(body));
  return true;
}

export function sendPublicJson(
  request: IncomingMessage,
  response: ServerResponse,
  body: unknown,
  correlationId: string,
): true {
  const serialized = JSON.stringify(body);
  const etag = `"${createHash('sha256').update(serialized).digest('base64url')}"`;
  response.setHeader('cache-control', 'public, no-cache');
  response.setHeader('etag', etag);
  response.setHeader('x-correlation-id', correlationId);
  setSecurityHeaders(response);
  if (requestMatchesIfNoneMatch(request, etag)) {
    response.statusCode = 304;
    response.end();
    return true;
  }
  response.statusCode = 200;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.end(serialized);
  return true;
}

export function requestMatchesIfNoneMatch(request: IncomingMessage, etag: string): boolean {
  return matchesIfNoneMatch(readHeaderValues(request, 'if-none-match'), etag);
}

function matchesIfNoneMatch(values: readonly string[] | undefined, etag: string): boolean {
  if (values === undefined) return false;
  const condition = parseIfNoneMatch(values.join(','));
  if (condition === null) return false;
  if (condition === '*') return true;
  const current = parseEntityTag(etag, 0);
  if (current === null || current.nextIndex !== etag.length) return false;
  return condition.some((candidate) => candidate.opaqueTag === current.opaqueTag);
}

function readHeaderValues(
  request: IncomingMessage,
  headerName: string,
): readonly string[] | undefined {
  const normalizedName = headerName.toLowerCase();
  for (const [name, values] of Object.entries(request.headersDistinct ?? {})) {
    if (name.toLowerCase() === normalizedName && values !== undefined) return values;
  }

  for (const [name, value] of Object.entries(request.headers)) {
    if (name.toLowerCase() !== normalizedName || value === undefined) continue;
    return Array.isArray(value) ? value : [value];
  }

  const rawValues: string[] = [];
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    const name = request.rawHeaders[index];
    const value = request.rawHeaders[index + 1];
    if (name?.toLowerCase() === normalizedName && value !== undefined) rawValues.push(value);
  }
  return rawValues.length === 0 ? undefined : rawValues;
}

interface ParsedEntityTag {
  readonly nextIndex: number;
  readonly opaqueTag: string;
}

function parseIfNoneMatch(value: string): '*' | readonly ParsedEntityTag[] | null {
  let index = skipOptionalWhitespace(value, 0);
  if (value[index] === '*') {
    index = skipOptionalWhitespace(value, index + 1);
    return index === value.length ? '*' : null;
  }

  const tags: ParsedEntityTag[] = [];
  while (index < value.length) {
    const parsed = parseEntityTag(value, index);
    if (parsed === null) return null;
    tags.push(parsed);
    index = skipOptionalWhitespace(value, parsed.nextIndex);
    if (index === value.length) return tags;
    if (value[index] !== ',') return null;
    index = skipOptionalWhitespace(value, index + 1);
    if (index === value.length) return null;
  }
  return null;
}

function parseEntityTag(value: string, startIndex: number): ParsedEntityTag | null {
  let index = startIndex;
  if (value.startsWith('W/', index)) index += 2;
  if (value[index] !== '"') return null;
  const opaqueStart = ++index;
  while (index < value.length && value[index] !== '"') {
    const codePoint = value.charCodeAt(index);
    if (!(
      codePoint === 0x21 ||
      (codePoint >= 0x23 && codePoint <= 0x7e) ||
      (codePoint >= 0x80 && codePoint <= 0xff)
    )) {
      return null;
    }
    index += 1;
  }
  if (value[index] !== '"') return null;
  return { nextIndex: index + 1, opaqueTag: value.slice(opaqueStart, index) };
}

function skipOptionalWhitespace(value: string, startIndex: number): number {
  let index = startIndex;
  while (value[index] === ' ' || value[index] === '\t') index += 1;
  return index;
}

export function setSecurityHeaders(response: ServerResponse): void {
  response.setHeader('content-security-policy', "default-src 'none'; frame-ancestors 'none'");
  response.setHeader('referrer-policy', 'no-referrer');
  response.setHeader('x-content-type-options', 'nosniff');
  response.setHeader('x-frame-options', 'DENY');
}
