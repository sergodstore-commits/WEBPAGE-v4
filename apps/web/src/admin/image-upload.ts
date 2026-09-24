/** Browsers infer MIME from the filename, not from the actual image bytes. */
export async function normalizeImageUpload(form: FormData): Promise<void> {
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) return;
  const bytes = new Uint8Array(
    await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(new Error('No se pudo leer el archivo seleccionado.'));
      reader.readAsArrayBuffer(file.slice(0, 128));
    }),
  );
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  let format: readonly [string, string] | undefined;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) format = ['image/jpeg', 'jpg'];
  else if (bytes[0] === 0x89 && ascii(1, 4) === 'PNG') format = ['image/png', 'png'];
  else if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') format = ['image/webp', 'webp'];
  else if (ascii(4, 8) === 'ftyp' && /avif|avis/.test(ascii(8, 128)))
    format = ['image/avif', 'avif'];
  if (!format) return; // The server still rejects unsupported/corrupt content.
  const [type, extension] = format;
  const name = `${file.name.replace(/\.[^.]+$/, '')}.${extension}`;
  form.set('file', new File([file], name, { type, lastModified: file.lastModified }));
}
