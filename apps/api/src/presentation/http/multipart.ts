import { Transform } from 'node:stream';
import type { IncomingMessage } from 'node:http';

import busboy from 'busboy';

import { HttpRequestError } from './http-utils.js';

export const MULTIPART_FILE_LIMIT_BYTES = 10_485_760;
export const MULTIPART_OVERHEAD_LIMIT_BYTES = 65_536;
export const MULTIPART_REQUEST_LIMIT_BYTES =
  MULTIPART_FILE_LIMIT_BYTES + MULTIPART_OVERHEAD_LIMIT_BYTES;

export interface ParsedMultipartFile {
  readonly bytes: Uint8Array;
  readonly declaredMimeType: string;
  readonly originalFilename: string;
}

export interface ParsedMultipartBody {
  readonly fields: Readonly<Record<string, string>>;
  readonly file: ParsedMultipartFile;
}

export function readBoundedMultipart(
  request: IncomingMessage,
  allowedFields: readonly string[],
  options: { readonly maximumFileBytes?: number } = {},
): Promise<ParsedMultipartBody> {
  const maximumFileBytes = options.maximumFileBytes ?? MULTIPART_FILE_LIMIT_BYTES;
  const maximumRequestBytes = maximumFileBytes + MULTIPART_OVERHEAD_LIMIT_BYTES;
  const contentType = request.headers['content-type'];
  if (
    typeof contentType !== 'string' ||
    !contentType.toLowerCase().startsWith('multipart/form-data;')
  ) {
    throw new HttpRequestError(
      'UNSUPPORTED_MEDIA_TYPE',
      415,
      'Content-Type must be multipart/form-data.',
    );
  }
  const contentLength = Number(request.headers['content-length']);
  if (Number.isFinite(contentLength) && contentLength > maximumRequestBytes) {
    throw new HttpRequestError('REQUEST_TOO_LARGE', 413, 'Request is too large.');
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let file: ParsedMultipartFile | undefined;
    let fileBytes = 0;
    let fileCount = 0;
    let totalBytes = 0;
    let limited = false;
    const fields: Record<string, string> = {};
    const fileChunks: Buffer[] = [];
    const limiter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        totalBytes += chunk.byteLength;
        if (totalBytes > maximumRequestBytes) {
          limited = true;
          callback(new HttpRequestError('REQUEST_TOO_LARGE', 413, 'Request is too large.'));
          return;
        }
        callback(null, chunk);
      },
    });

    const fail = (error: unknown): void => {
      if (settled) return;
      settled = true;
      request.unpipe(limiter);
      limiter.destroy();
      if (error instanceof HttpRequestError && error.httpStatus === 413) request.pause();
      else request.resume();
      reject(
        error instanceof HttpRequestError
          ? error
          : new HttpRequestError('INVALID_MULTIPART', 400, 'Request body must be valid multipart.'),
      );
    };

    let parser: ReturnType<typeof busboy>;
    try {
      parser = busboy({
        headers: request.headers,
        limits: {
          fieldNameSize: 100,
          fieldSize: MULTIPART_OVERHEAD_LIMIT_BYTES,
          fields: allowedFields.length + 1,
          fileSize: maximumFileBytes,
          files: 2,
          headerPairs: 32,
          parts: allowedFields.length + 2,
        },
        preservePath: true,
      });
    } catch (error) {
      fail(error);
      return;
    }

    limiter.once('error', fail);
    parser.once('error', fail);
    parser.once('filesLimit', () => fail(invalidMultipart()));
    parser.once('fieldsLimit', () => fail(invalidMultipart()));
    parser.once('partsLimit', () => fail(invalidMultipart()));
    parser.on('field', (name, value, info) => {
      if (!allowedFields.includes(name) || name in fields || info.valueTruncated) {
        fail(invalidMultipart());
        return;
      }
      fields[name] = value;
    });
    parser.on('file', (name, stream, info) => {
      fileCount += 1;
      if (name !== 'file' || fileCount !== 1 || info.filename === '') {
        stream.resume();
        fail(invalidMultipart());
        return;
      }
      stream.once('limit', () => {
        fail(new HttpRequestError('REQUEST_TOO_LARGE', 413, 'Request is too large.'));
      });
      stream.on('data', (chunk: Buffer) => {
        fileBytes += chunk.byteLength;
        if (fileBytes <= maximumFileBytes) fileChunks.push(Buffer.from(chunk));
      });
      stream.once('end', () => {
        if (fileBytes > maximumFileBytes) {
          fail(new HttpRequestError('REQUEST_TOO_LARGE', 413, 'Request is too large.'));
          return;
        }
        file = {
          bytes: Buffer.concat(fileChunks),
          declaredMimeType: info.mimeType,
          originalFilename: info.filename,
        };
      });
      stream.once('error', fail);
    });
    parser.once('close', () => {
      if (settled || limited) return;
      if (
        file === undefined ||
        fileCount !== 1 ||
        totalBytes - fileBytes > MULTIPART_OVERHEAD_LIMIT_BYTES
      ) {
        fail(invalidMultipart());
        return;
      }
      settled = true;
      resolve({ fields, file });
    });

    request.once('aborted', () => fail(invalidMultipart()));
    request.once('error', fail);
    request.pipe(limiter).pipe(parser);
  });
}

function invalidMultipart(): HttpRequestError {
  return new HttpRequestError('INVALID_MULTIPART', 400, 'Request body must be valid multipart.');
}
