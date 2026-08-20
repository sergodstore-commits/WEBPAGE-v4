const baseUrl = (process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000').replace(/\/+$/u, '');

const checks = [
  ['/health', 200],
  ['/api/v1/catalog/products?limit=1&sort=NEWEST', 200],
  ['/api/v1/content?limit=1', 200],
];

for (const [path, expected] of checks) {
  const response = await fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(10_000) });
  if (response.status !== expected) {
    throw new Error(`E2E smoke failed for ${path}: HTTP ${response.status}.`);
  }
  if (response.headers.get('x-content-type-options') !== 'nosniff') {
    throw new Error(`Security headers are absent for ${path}.`);
  }
  process.stdout.write(`PASS ${path}\n`);
}

if (process.env.E2E_ADMIN_ACCESS_TOKEN === undefined) {
  process.stdout.write(
    'DEFERRED_EXTERNAL authenticated customer/admin/payment smoke: token absent\n',
  );
} else {
  const response = await fetch(`${baseUrl}/api/v1/admin/orders?limit=1`, {
    headers: { authorization: `Bearer ${process.env.E2E_ADMIN_ACCESS_TOKEN}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status !== 200) throw new Error(`Admin E2E smoke failed: HTTP ${response.status}.`);
  process.stdout.write('PASS authenticated admin smoke\n');
}
