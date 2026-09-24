import { expect, it } from 'vitest';
import { normalizeImageUpload } from './image-upload.js';

it('corrects a JPEG named PNG without altering the image bytes', async () => {
  const form = new FormData();
  const bytes = new Uint8Array([255, 216, 255, 224, 0, 5, 255, 217]);
  form.set('file', new File([bytes], 'logo.png', { type: 'image/png' }));
  await normalizeImageUpload(form);
  const file = form.get('file') as File;
  expect(file.name).toBe('logo.jpg');
  expect(file.type).toBe('image/jpeg');
  expect(file.size).toBe(bytes.length);
});

it('does not relabel unsupported data as an image', async () => {
  const form = new FormData();
  form.set('file', new File(['<script>bad</script>'], 'bad.png', { type: 'image/png' }));
  await normalizeImageUpload(form);
  expect((form.get('file') as File).name).toBe('bad.png');
});
