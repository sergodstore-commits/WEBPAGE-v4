import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

// Input report and original downloads are private and never included in Git.
const report = JSON.parse(
  await readFile(process.argv[2] || '.data/product-image-audit.json', 'utf8'),
);
const destination = '.data/product-images-normalized';
await mkdir(destination, { recursive: true });
const output = [];
for (const item of report) {
  const { data, info } = await sharp(item.file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  let removed = 0;
  if (item.whiteEdge > 0.7) {
    // Only neutral light pixels connected to the exterior are background.
    // White lettering inside packaging remains enclosed and unchanged.
    const visited = new Uint8Array(width * height),
      queue = new Int32Array(width * height);
    let head = 0,
      tail = 0;
    const push = (index) => {
      if (visited[index]) return;
      visited[index] = 1;
      const pixel = index * 4;
      const low = Math.min(data[pixel], data[pixel + 1], data[pixel + 2]);
      const high = Math.max(data[pixel], data[pixel + 1], data[pixel + 2]);
      if (data[pixel + 3] < 10 || (low >= 220 && high - low <= 24)) queue[tail++] = index;
    };
    for (let x = 0; x < width; x++) {
      push(x);
      push((height - 1) * width + x);
    }
    for (let y = 0; y < height; y++) {
      push(y * width);
      push(y * width + width - 1);
    }
    // Optional seeds are reviewed background holes, e.g. a hanger opening.
    for (const seed of item.backgroundSeeds || []) {
      if (seed.x >= 0 && seed.x < width && seed.y >= 0 && seed.y < height)
        push(seed.y * width + seed.x);
    }
    while (head < tail) {
      const index = queue[head++],
        x = index % width,
        y = Math.floor(index / width);
      data[index * 4 + 3] = 0;
      removed++;
      if (x > 0) push(index - 1);
      if (x < width - 1) push(index + 1);
      if (y > 0) push(index - width);
      if (y < height - 1) push(index + width);
    }
  }
  let left = width,
    top = height,
    right = -1,
    bottom = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (data[(y * width + x) * 4 + 3] > 0) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
  if (right < left) throw Error(`No quedó producto: ${item.file}`);
  const cut = await sharp(data, { raw: { width, height, channels: 4 } })
    .extract({ left, top, width: right - left + 1, height: bottom - top + 1 })
    .resize(880, 880, { fit: 'inside' })
    .png()
    .toBuffer();
  const dimensions = await sharp(cut).metadata();
  const file = path.join(destination, path.basename(item.file));
  await sharp({
    create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      {
        input: cut,
        left: Math.floor((1024 - dimensions.width) / 2),
        top: Math.floor((1024 - dimensions.height) / 2),
      },
    ])
    .webp({ quality: 90 })
    .toFile(file);
  output.push({ ...item, normalized: file, removed, bounds: { left, top, right, bottom } });
}
await writeFile('.data/product-images-normalized.json', JSON.stringify(output, null, 2));
console.log(
  JSON.stringify({
    images: output.length,
    whiteBackgroundsRemoved: output.filter((x) => x.removed > 0).length,
    canvas: '1024 × 1024',
    maxProductEdge: 880,
    originalsUnchanged: true,
  }),
);
