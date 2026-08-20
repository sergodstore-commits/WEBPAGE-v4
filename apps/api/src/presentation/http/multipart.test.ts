import type { IncomingMessage } from 'node:http';
import { Readable } from 'node:stream';

import { describe, expect, it } from 'vitest';

import {
  MULTIPART_FILE_LIMIT_BYTES,
  MULTIPART_REQUEST_LIMIT_BYTES,
  readBoundedMultipart,
} from './multipart.js';

const boundary = 'sergod-test-boundary';

describe('bounded multipart reader', () => {
  it('parses one bounded file and only approved text fields', async () => {
    const request = multipartRequest([
      field('altText', 'Imagen segura'),
      field('position', '1'),
      file('file', 'imagen.png', 'image/png', Buffer.from([1, 2, 3])),
    ]);
    await expect(readBoundedMultipart(request, ['altText', 'position'])).resolves.toEqual({
      fields: { altText: 'Imagen segura', position: '1' },
      file: {
        bytes: Buffer.from([1, 2, 3]),
        declaredMimeType: 'image/png',
        originalFilename: 'imagen.png',
      },
    });
  });

  it('rejects malformed multipart and unknown fields', async () => {
    const malformed = streamRequest(Buffer.from('invalid'), {
      'content-type': `multipart/form-data; boundary=${boundary}`,
    });
    await expect(readBoundedMultipart(malformed, ['altText'])).rejects.toMatchObject({
      code: 'INVALID_MULTIPART',
      httpStatus: 400,
    });
    const unknown = multipartRequest([
      field('unexpected', 'value'),
      file('file', 'imagen.png', 'image/png', Buffer.from([1])),
    ]);
    await expect(readBoundedMultipart(unknown, ['altText'])).rejects.toMatchObject({
      code: 'INVALID_MULTIPART',
    });
  });

  it('rejects a missing file, multiple files and an unsupported content type', async () => {
    await expect(
      readBoundedMultipart(multipartRequest([field('altText', 'Sin archivo')]), ['altText']),
    ).rejects.toMatchObject({ code: 'INVALID_MULTIPART' });
    await expect(
      readBoundedMultipart(
        multipartRequest([
          field('altText', 'Dos archivos'),
          file('file', 'uno.png', 'image/png', Buffer.from([1])),
          file('file', 'dos.png', 'image/png', Buffer.from([2])),
        ]),
        ['altText'],
      ),
    ).rejects.toMatchObject({ code: 'INVALID_MULTIPART' });
    const json = streamRequest(Buffer.from('{}'), { 'content-type': 'application/json' });
    expect(() => readBoundedMultipart(json, ['altText'])).toThrowError(
      expect.objectContaining({ code: 'UNSUPPORTED_MEDIA_TYPE', httpStatus: 415 }),
    );
  });

  it('stops and rejects as soon as the file limit is exceeded', async () => {
    const oversized = multipartRequest([
      field('altText', 'Grande'),
      file('file', 'grande.png', 'image/png', Buffer.alloc(MULTIPART_FILE_LIMIT_BYTES + 1)),
    ]);
    await expect(readBoundedMultipart(oversized, ['altText'])).rejects.toMatchObject({
      code: 'REQUEST_TOO_LARGE',
      httpStatus: 413,
    });
    expect(oversized.readableFlowing).toBe(false);
  });

  it('rejects a declared request over the total limit before reading it', () => {
    const request = streamRequest(Buffer.alloc(0), {
      'content-length': String(MULTIPART_REQUEST_LIMIT_BYTES + 1),
      'content-type': `multipart/form-data; boundary=${boundary}`,
    });
    expect(() => readBoundedMultipart(request, ['altText'])).toThrowError(
      expect.objectContaining({ code: 'REQUEST_TOO_LARGE', httpStatus: 413 }),
    );
  });
});

function multipartRequest(parts: readonly Buffer[]): IncomingMessage {
  const body = Buffer.concat([...parts, Buffer.from(`--${boundary}--\r\n`, 'utf8')]);
  return streamRequest(body, {
    'content-length': String(body.byteLength),
    'content-type': `multipart/form-data; boundary=${boundary}`,
  });
}

function field(name: string, value: string): Buffer {
  return Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
    'utf8',
  );
}

function file(name: string, filename: string, contentType: string, bytes: Buffer): Buffer {
  return Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
      'utf8',
    ),
    bytes,
    Buffer.from('\r\n', 'utf8'),
  ]);
}

function streamRequest(body: Buffer, headers: Record<string, string>): IncomingMessage {
  return Object.assign(Readable.from([body]), { headers }) as unknown as IncomingMessage;
}
