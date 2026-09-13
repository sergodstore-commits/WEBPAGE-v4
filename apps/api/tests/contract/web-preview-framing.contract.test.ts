import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('Vercel same-origin appearance preview framing', () => {
  it('allows only the site itself to embed the public preview', () => {
    const config = JSON.parse(readFileSync(resolve('vercel.json'), 'utf8')) as {
      headers: Array<{
        source: string;
        headers: Array<{ key: string; value: string }>;
      }>;
    };
    const globalHeaders = config.headers.find(({ source }) => source === '/(.*)')?.headers ?? [];
    const header = (key: string) =>
      globalHeaders.find((candidate) => candidate.key.toLowerCase() === key.toLowerCase())?.value;

    expect(header('Content-Security-Policy')).toContain("frame-ancestors 'self'");
    expect(header('Content-Security-Policy')).not.toContain("frame-ancestors 'none'");
    expect(header('X-Frame-Options')).toBeUndefined();
  });
});
