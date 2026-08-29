import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const stateUrl = new URL('.runtime/codex/remote-flow-acceptance-state.json', root);
const mode = process.argv[2];
if (!['--cleanup-failed', '--finalize', '--prepare'].includes(mode))
  throw new Error('Use --prepare, --finalize or --cleanup-failed.');

const env = {};
for (const line of readFileSync(new URL('.env', root), 'utf8').split(/\r?\n/u)) {
  const trimmed = line.trim();
  if (trimmed === '' || trimmed.startsWith('#')) continue;
  const separator = trimmed.indexOf('=');
  if (separator < 1) continue;
  let value = trimmed.slice(separator + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  env[trimmed.slice(0, separator).trim()] = value;
}

const api = new URL(env.API_PUBLIC_URL);
if (api.protocol !== 'https:' || api.hostname !== 'sergod-store-api-v4.onrender.com') {
  throw new Error('Remote Flow acceptance is restricted to the expected staging API.');
}
for (const key of [
  'SERGOD_ADMIN_EMAIL',
  'SERGOD_ADMIN_PASSWORD',
  'SERGOD_CLIENT_EMAIL',
  'SERGOD_CLIENT_PASSWORD',
]) {
  if (typeof env[key] !== 'string' || env[key].trim() === '')
    throw new Error(`${key} is required.`);
}

async function request(path, { body, idempotencyKey, method = 'GET', token } = {}) {
  const response = await fetch(new URL(path, api), {
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(idempotencyKey === undefined ? {} : { 'idempotency-key': idempotencyKey }),
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
    },
    method,
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      `${method} ${path} :: HTTP ${response.status} :: ${payload?.error?.code ?? 'UNKNOWN'}`,
    );
  return payload;
}

async function login(email, password) {
  const session = await request('/api/v1/identity/sessions', {
    body: { email, password },
    method: 'POST',
  });
  if (typeof session.accessToken !== 'string')
    throw new Error('Login did not return an access token.');
  return session.accessToken;
}

async function selectFixture(adminToken) {
  const suffix = '94bcf7403ad64419b360d927d2a7ae1b';
  const specifications = [
    ['game', 'tcg-games', `Phase 3F Game ${suffix}`, 'gameId'],
    ['category', 'categories', `Phase 3F Category ${suffix}`, 'categoryId'],
    ['collection', 'collections', `Phase 3F Collection ${suffix}`, 'collectionId'],
    ['product', 'products', `Phase 3F Main Product ${suffix}`, 'productId'],
  ];
  const entities = [];
  for (const [kind, segment, name, idField] of specifications) {
    const page = await request(`/api/v1/admin/catalog/${segment}?limit=25`, { token: adminToken });
    const matches = page.items.filter((item) => item.name === name);
    if (matches.length !== 1)
      throw new Error(`Expected exactly one ${kind} fixture; found ${matches.length}.`);
    const item = matches[0];
    entities.push({ id: item[idField], kind, segment, status: item.publicationStatus });
  }
  return entities;
}

async function transition(adminToken, entity, nextStatus, runId) {
  await request(`/api/v1/admin/catalog/${entity.segment}/${entity.id}/publication-transitions`, {
    body: { nextStatus },
    idempotencyKey: `${runId}:${nextStatus.toLowerCase()}:${entity.kind}`,
    method: 'POST',
    token: adminToken,
  });
}

async function rollbackBeforeOrder(state, adminToken, clientToken) {
  const failures = [];
  if (state.cartLineId !== undefined) {
    try {
      await request(`/api/v1/cart/lines/${state.cartLineId}`, {
        idempotencyKey: `${state.runId}:rollback-line`,
        method: 'DELETE',
        token: clientToken,
      });
    } catch (error) {
      failures.push(error.message);
    }
  }
  if (state.stockAdded === true) {
    try {
      const position = await request(`/api/v1/admin/inventory/products/${state.productId}`, {
        token: adminToken,
      });
      const surplus = Number(position.item.onHand) - state.originalOnHand;
      if (Number(position.item.reserved) !== state.originalReserved || surplus < 0) {
        failures.push('Inventory cannot be restored automatically.');
      } else if (surplus > 0) {
        await request(`/api/v1/admin/inventory/products/${state.productId}/adjustments`, {
          body: {
            direction: 'NEGATIVE',
            investigationReference: state.runId,
            quantity: surplus,
            reason: 'Restore stock after Flow acceptance preparation failure',
          },
          idempotencyKey: `${state.runId}:rollback-stock`,
          method: 'POST',
          token: adminToken,
        });
      }
    } catch (error) {
      failures.push(error.message);
    }
  }
  for (const entity of state.entities.slice(0, state.publishedCount).reverse()) {
    try {
      await transition(adminToken, entity, 'UNPUBLISHED', state.runId);
    } catch (error) {
      failures.push(error.message);
    }
  }
  return failures;
}

async function prepare() {
  try {
    readFileSync(stateUrl, 'utf8');
    throw new Error('A remote Flow acceptance state already exists; finalize it first.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const adminToken = await login(env.SERGOD_ADMIN_EMAIL, env.SERGOD_ADMIN_PASSWORD);
  const clientToken = await login(env.SERGOD_CLIENT_EMAIL, env.SERGOD_CLIENT_PASSWORD);
  const entities = await selectFixture(adminToken);
  if (entities.some((entity) => entity.status !== 'UNPUBLISHED'))
    throw new Error('Technical catalog fixtures must start unpublished.');
  const product = entities.find((entity) => entity.kind === 'product');
  const positionBefore = await request(`/api/v1/admin/inventory/products/${product.id}`, {
    token: adminToken,
  });
  const runId = `ACCEPT-FLOW-E2E-${new Date().toISOString().replace(/\D/gu, '').slice(0, 14)}`;
  const state = {
    entities,
    originalOnHand: Number(positionBefore.item.onHand),
    originalReserved: Number(positionBefore.item.reserved),
    productId: product.id,
    publishedCount: 0,
    runId,
  };
  try {
    const existingCart = await request('/api/v1/cart', { token: clientToken });
    const existingLines = existingCart.item?.groups.flatMap((group) => group.lines) ?? [];
    if (existingLines.length !== 0) throw new Error('The acceptance client cart is not empty.');
    for (const entity of entities) {
      await transition(adminToken, entity, 'PUBLISHED', runId);
      state.publishedCount += 1;
    }
    const stock = await request(`/api/v1/admin/inventory/products/${product.id}/stock-entries`, {
      body: { quantity: 1, reason: 'Remote Flow acceptance', reference: runId },
      idempotencyKey: `${runId}:stock`,
      method: 'POST',
      token: adminToken,
    });
    if (Number(stock.position.onHand) !== state.originalOnHand + 1)
      throw new Error('Stock entry invariant failed.');
    state.stockAdded = true;
    if (existingCart.item === null) {
      await request('/api/v1/cart', {
        body: {},
        idempotencyKey: `${runId}:cart`,
        method: 'POST',
        token: clientToken,
      });
    }
    const added = await request('/api/v1/cart/lines', {
      body: { preorderCampaignId: null, productId: product.id, quantity: 1 },
      idempotencyKey: `${runId}:line`,
      method: 'POST',
      token: clientToken,
    });
    const groups = added.item.groups.filter((group) =>
      group.lines.some((line) => line.productId === product.id),
    );
    if (groups.length !== 1) throw new Error('Could not identify the acceptance cart group.');
    state.cartGroupId = groups[0].cartGroupId;
    state.cartLineId = groups[0].lines.find((line) => line.productId === product.id).cartLineId;
    await request(`/api/v1/checkout/groups/${state.cartGroupId}/delivery-intent`, {
      body: { branchId: positionBefore.item.branchId, mode: 'PICKUP' },
      idempotencyKey: `${runId}:pickup`,
      method: 'PUT',
      token: clientToken,
    });
    const revalidated = await request(`/api/v1/checkout/groups/${state.cartGroupId}/revalidate`, {
      body: {},
      idempotencyKey: `${runId}:revalidate`,
      method: 'POST',
      token: clientToken,
    });
    if (!revalidated.item.canCreateOrder || Number(revalidated.item.totalAmountClp) <= 0)
      throw new Error('Checkout is not eligible for an external payment.');
    state.amountClp = Number(revalidated.item.totalAmountClp);
    const order = await request(`/api/v1/checkout/groups/${state.cartGroupId}/order`, {
      body: {},
      idempotencyKey: `${runId}:order`,
      method: 'POST',
      token: clientToken,
    });
    state.orderId = order.item.orderId;
    state.orderPublicNumber = order.item.publicNumber;
    const payment = await request(`/api/v1/orders/${state.orderId}/payment-attempts`, {
      body: { payerEmail: env.SERGOD_CLIENT_EMAIL, provider: 'FLOW' },
      idempotencyKey: `${runId}:payment`,
      method: 'POST',
      token: clientToken,
    });
    const redirect = new URL(payment.item.redirectUrl);
    if (redirect.hostname !== 'sandbox.flow.cl') throw new Error('Flow redirect is not sandbox.');
    state.paymentAttemptId = payment.item.paymentAttemptId;
    state.redirectUrl = redirect.href;
    writeFileSync(stateUrl, `${JSON.stringify(state, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    console.log('REMOTE_FLOW_PREPARE=PASS');
    console.log(`ACCEPTANCE_RUN_ID=${runId}`);
    console.log(`ORDER_PUBLIC_NUMBER=${state.orderPublicNumber}`);
    console.log(`AMOUNT_CLP=${state.amountClp}`);
    console.log(`PAYMENT_STATUS=${payment.item.status}`);
  } catch (error) {
    writeFileSync(stateUrl, `${JSON.stringify(state, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    if (state.orderId === undefined) {
      const rollbackFailures = await rollbackBeforeOrder(state, adminToken, clientToken);
      if (rollbackFailures.length === 0) unlinkSync(stateUrl);
      else
        throw new Error(`${error.message} :: ROLLBACK_FAILED :: ${rollbackFailures.join(' | ')}`, {
          cause: error,
        });
    }
    throw error;
  }
}

async function finalize() {
  const state = JSON.parse(readFileSync(stateUrl, 'utf8'));
  const adminToken = await login(env.SERGOD_ADMIN_EMAIL, env.SERGOD_ADMIN_PASSWORD);
  const clientToken = await login(env.SERGOD_CLIENT_EMAIL, env.SERGOD_CLIENT_PASSWORD);
  await request(`/api/v1/admin/payment-attempts/${state.paymentAttemptId}/reconcile`, {
    method: 'POST',
    token: adminToken,
  });
  const payment = await request(`/api/v1/payment-attempts/${state.paymentAttemptId}`, {
    token: clientToken,
  });
  const order = await request(`/api/v1/orders/${state.orderId}`, { token: clientToken });
  if (payment.item.status !== 'SUCCEEDED' || order.item.state !== 'PAID')
    throw new Error(
      `Flow acceptance is not terminal: payment=${payment.item.status}, order=${order.item.state}.`,
    );
  const position = await request(`/api/v1/admin/inventory/products/${state.productId}`, {
    token: adminToken,
  });
  if (
    Number(position.item.onHand) !== state.originalOnHand ||
    Number(position.item.reserved) !== state.originalReserved
  )
    throw new Error('Inventory did not return to its original projection.');
  for (const entity of [...state.entities].reverse())
    await transition(adminToken, entity, 'UNPUBLISHED', state.runId);
  unlinkSync(stateUrl);
  console.log('REMOTE_FLOW_ACCEPTANCE=PASS');
  console.log(`ACCEPTANCE_RUN_ID=${state.runId}`);
  console.log(`ORDER_PUBLIC_NUMBER=${state.orderPublicNumber}`);
  console.log('PAYMENT_STATUS=SUCCEEDED');
  console.log('ORDER_STATUS=PAID');
  console.log('REMOTE_FLOW_CLEANUP=PASS');
}

async function cleanupFailed() {
  const state = JSON.parse(readFileSync(stateUrl, 'utf8'));
  if (state.orderId === undefined) throw new Error('The failed run has no order to clean up.');
  if (state.paymentAttemptId !== undefined)
    throw new Error('A payment attempt exists; use the terminal payment flow instead.');

  const adminToken = await login(env.SERGOD_ADMIN_EMAIL, env.SERGOD_ADMIN_PASSWORD);
  const clientToken = await login(env.SERGOD_CLIENT_EMAIL, env.SERGOD_CLIENT_PASSWORD);
  const order = await request(`/api/v1/orders/${state.orderId}`, { token: clientToken });
  if (order.item.state !== 'CANCELLED')
    throw new Error(`The failed order is not safe to clean up: state=${order.item.state}.`);

  const position = await request(`/api/v1/admin/inventory/products/${state.productId}`, {
    token: adminToken,
  });
  const onHand = Number(position.item.onHand);
  const reserved = Number(position.item.reserved);
  const surplus = onHand - state.originalOnHand;
  if (reserved !== state.originalReserved || surplus < 0 || surplus > 1)
    throw new Error('Inventory cannot be restored automatically.');
  if (surplus > 0) {
    await request(`/api/v1/admin/inventory/products/${state.productId}/adjustments`, {
      body: {
        direction: 'NEGATIVE',
        investigationReference: state.runId,
        quantity: surplus,
        reason: 'Restore stock after failed Flow acceptance attempt',
      },
      idempotencyKey: `${state.runId}:cleanup-failed-stock`,
      method: 'POST',
      token: adminToken,
    });
  }

  const currentEntities = await selectFixture(adminToken);
  for (const stored of [...state.entities].reverse()) {
    const current = currentEntities.find(
      (entity) => entity.kind === stored.kind && entity.id === stored.id,
    );
    if (current === undefined) throw new Error(`The ${stored.kind} fixture identity changed.`);
    if (current.status === 'PUBLISHED')
      await transition(adminToken, current, 'UNPUBLISHED', state.runId);
    else if (current.status !== 'UNPUBLISHED')
      throw new Error(`The ${stored.kind} fixture is in unexpected state ${current.status}.`);
  }

  const restored = await request(`/api/v1/admin/inventory/products/${state.productId}`, {
    token: adminToken,
  });
  if (
    Number(restored.item.onHand) !== state.originalOnHand ||
    Number(restored.item.reserved) !== state.originalReserved
  )
    throw new Error('Inventory cleanup verification failed.');

  unlinkSync(stateUrl);
  console.log('REMOTE_FLOW_FAILED_CLEANUP=PASS');
  console.log(`ACCEPTANCE_RUN_ID=${state.runId}`);
  console.log(`ORDER_PUBLIC_NUMBER=${state.orderPublicNumber}`);
  console.log('ORDER_STATUS=CANCELLED');
}

await (mode === '--prepare' ? prepare() : mode === '--finalize' ? finalize() : cleanupFailed());
