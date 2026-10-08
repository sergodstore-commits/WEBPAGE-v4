import test from 'node:test';
import assert from 'node:assert/strict';
import { instagramEmbedUrl } from '../lib/news';
test('Instagram embed accepts only canonical post/reel links and discards query data', () => {
  assert.equal(
    instagramEmbedUrl('https://instagram.com/p/abc-12_/?igsh=tracking'),
    'https://www.instagram.com/p/abc-12_/embed/',
  );
  assert.equal(
    instagramEmbedUrl('https://www.instagram.com/reel/ABC/'),
    'https://www.instagram.com/reel/ABC/embed/',
  );
  for (const link of [
    'javascript:alert(1)',
    'https://instagram.com.evil.test/p/a/',
    'https://user:pass@instagram.com/p/a/',
    'http://instagram.com/p/a/',
    'https://instagram.com:8443/p/a/',
    'https://instagram.com/stories/a/',
    'https://instagram.com/p/a/embed/',
  ])
    assert.equal(instagramEmbedUrl(link), null);
});
