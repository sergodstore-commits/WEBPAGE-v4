import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const stateUrl = new URL('.runtime/codex/remote-preorder-freight-state.json', root);
const mode = process.argv[2];
if (!['--cleanup-failed', '--recover-failed', '--prepare', '--finalize'].includes(mode))
  throw new Error('Use --prepare, --finalize, --recover-failed or --cleanup-failed.');

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
  )
    value = value.slice(1, -1);
  env[trimmed.slice(0, separator).trim()] = value;
}
const api = new URL(env.API_PUBLIC_URL);
if (api.protocol !== 'https:' || api.hostname !== 'sergod-store-api-v4.onrender.com')
  throw new Error('Acceptance is restricted to the expected staging API.');

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
  if (typeof session.accessToken !== 'string') throw new Error('Login did not return a token.');
  return session.accessToken;
}

async function catalogTransition(adminToken, entity, nextStatus, runId) {
  await request(`/api/v1/admin/catalog/${entity.segment}/${entity.id}/publication-transitions`, {
    body: { nextStatus },
    idempotencyKey: `${runId}:catalog:${entity.kind}:${nextStatus}`,
    method: 'POST',
    token: adminToken,
  });
}

async function campaignTransition(adminToken, campaignId, dimension, body, key) {
  await request(`/api/v1/admin/preorders/campaigns/${campaignId}/${dimension}-transitions`, {
    body,
    idempotencyKey: key,
    method: 'POST',
    token: adminToken,
  });
}

async function selectTechnicalProduct(adminToken) {
  const campaigns = await request('/api/v1/admin/preorders/campaigns?limit=100', {
    token: adminToken,
  });
  const productIds = [...new Set(campaigns.items.map((item) => item.productId))];
  for (const productId of productIds) {
    const productResponse = await request(`/api/v1/admin/catalog/products/${productId}`, {
      token: adminToken,
    });
    const product = productResponse.item;
    if (product.saleType === 'PREORDER' && product.name.startsWith('Preventa ')) {
      const source = campaigns.items.find((item) => item.productId === productId);
      if (source === undefined) continue;
      return { branchId: source.branchId, product };
    }
  }
  throw new Error('No technical preorder product is available in staging.');
}

async function catalogChain(adminToken, product) {
  const [gameResponse, categoryResponse, collectionResponse] = await Promise.all([
    request(`/api/v1/admin/catalog/tcg-games/${product.gameId}`, { token: adminToken }),
    request(`/api/v1/admin/catalog/categories/${product.categoryId}`, { token: adminToken }),
    product.collectionId === null
      ? Promise.resolve(null)
      : request(`/api/v1/admin/catalog/collections/${product.collectionId}`, {
          token: adminToken,
        }),
  ]);
  const game = gameResponse.item;
  const category = categoryResponse.item;
  const collection = collectionResponse?.item;
  return [
    { id: game.gameId, kind: 'game', segment: 'tcg-games', status: game.publicationStatus },
    {
      id: category.categoryId,
      kind: 'category',
      segment: 'categories',
      status: category.publicationStatus,
    },
    ...(collection === undefined
      ? []
      : [
          {
            id: collection.collectionId,
            kind: 'collection',
            segment: 'collections',
            status: collection.publicationStatus,
          },
        ]),
    {
      id: product.productId,
      kind: 'product',
      segment: 'products',
      status: product.publicationStatus,
    },
  ];
}

async function clearTechnicalCart(clientToken, productId, runId) {
  const cart = await request('/api/v1/cart', { token: clientToken });
  const lines = cart.item?.groups.flatMap((group) => group.lines) ?? [];
  if (lines.some((line) => line.productId !== productId))
    throw new Error('The client cart contains a non-technical product.');
  for (const line of lines)
    await request(`/api/v1/cart/lines/${line.cartLineId}`, {
      idempotencyKey: `${runId}:clear:${line.cartLineId}`,
      method: 'DELETE',
      token: clientToken,
    });
  return cart.item === null;
}

async function cleanupBeforeOrder(state, adminToken, clientToken) {
  const failures = [];
  if (state.cartLineId !== undefined) {
    try {
      await request(`/api/v1/cart/lines/${state.cartLineId}`, {
        idempotencyKey: `${state.runId}:cleanup-line`,
        method: 'DELETE',
        token: clientToken,
      });
    } catch (error) {
      if (!error.message.includes('CART_LINE_NOT_FOUND')) failures.push(error.message);
    }
  }
  if (state.campaignId !== undefined) {
    try {
      await campaignTransition(
        adminToken,
        state.campaignId,
        'operational',
        { nextState: 'CANCELLED', reason: 'Acceptance preparation cleanup' },
        `${state.runId}:cancel-campaign`,
      );
    } catch (error) {
      failures.push(error.message);
    }
  }
  for (const entity of [...(state.changedEntities ?? [])].reverse()) {
    try {
      await catalogTransition(adminToken, entity, 'UNPUBLISHED', state.runId);
    } catch (error) {
      failures.push(error.message);
    }
  }
  return failures;
}

async function prepare() {
  try {
    readFileSync(stateUrl, 'utf8');
    throw new Error('An acceptance state already exists.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const adminToken = await login(env.SERGOD_ADMIN_EMAIL, env.SERGOD_ADMIN_PASSWORD);
  const clientToken = await login(env.SERGOD_CLIENT_EMAIL, env.SERGOD_CLIENT_PASSWORD);
  const selected = await selectTechnicalProduct(adminToken);
  const entities = await catalogChain(adminToken, selected.product);
  if (entities.some((entity) => !['DRAFT', 'UNPUBLISHED'].includes(entity.status)))
    throw new Error('Technical catalog chain must not already be public.');
  const runId = `ACCEPT-PREORDER-FREIGHT-${new Date().toISOString().replace(/\D/gu, '').slice(0, 14)}`;
  const state = {
    branchId: selected.branchId,
    changedEntities: [],
    entities,
    productId: selected.product.productId,
    runId,
  };
  try {
    const needsCart = await clearTechnicalCart(clientToken, state.productId, runId);
    for (const entity of entities) {
      await catalogTransition(adminToken, entity, 'PUBLISHED', runId);
      state.changedEntities.push(entity);
    }
    const now = Date.now();
    const campaign = await request('/api/v1/admin/preorders/campaigns', {
      body: {
        branchId: state.branchId,
        capacity: 2,
        closesAt: new Date(now + 2 * 60 * 60_000).toISOString(),
        estimatedArrivalText: 'Aceptación técnica Sergod Store',
        fulfillmentGroupKey: null,
        opensAt: new Date(now - 5 * 60_000).toISOString(),
        productId: state.productId,
      },
      idempotencyKey: `${runId}:campaign`,
      method: 'POST',
      token: adminToken,
    });
    state.campaignId = campaign.item.preorderCampaignId;
    state.originalCommitted = Number(campaign.item.committed);
    state.originalReserved = Number(campaign.item.temporarilyReserved);
    await campaignTransition(
      adminToken,
      state.campaignId,
      'operational',
      { nextState: 'OPEN', reason: null },
      `${runId}:open-campaign`,
    );
    await campaignTransition(
      adminToken,
      state.campaignId,
      'publication',
      { nextStatus: 'PUBLISHED', reason: null },
      `${runId}:publish-campaign`,
    );
    if (needsCart)
      await request('/api/v1/cart', {
        body: {},
        idempotencyKey: `${runId}:cart`,
        method: 'POST',
        token: clientToken,
      });
    const added = await request('/api/v1/cart/lines', {
      body: { preorderCampaignId: state.campaignId, productId: state.productId, quantity: 1 },
      idempotencyKey: `${runId}:line`,
      method: 'POST',
      token: clientToken,
    });
    const group = added.item.groups.find((item) =>
      item.lines.some((line) => line.preorderCampaignId === state.campaignId),
    );
    if (group === undefined || group.groupType !== 'PREORDER')
      throw new Error('The preorder cart group was not created.');
    state.cartGroupId = group.cartGroupId;
    state.cartLineId = group.lines.find(
      (line) => line.preorderCampaignId === state.campaignId,
    ).cartLineId;
    await request(`/api/v1/checkout/groups/${state.cartGroupId}/delivery-intent`, {
      body: {
        agencyDestination: 'Agencia Starken Centro',
        carrier: 'STARKEN',
        destinationCommune: 'Copiapó',
        destinationType: 'CARRIER_AGENCY',
        mode: 'SHIPPING',
        recipientName: 'Cliente aceptación Sergod',
        shippingIncludedInOrderTotal: false,
        shippingPaymentMode: 'FREIGHT_COLLECT',
      },
      idempotencyKey: `${runId}:freight`,
      method: 'PUT',
      token: clientToken,
    });
    const revalidated = await request(`/api/v1/checkout/groups/${state.cartGroupId}/revalidate`, {
      body: {},
      idempotencyKey: `${runId}:revalidate`,
      method: 'POST',
      token: clientToken,
    });
    if (
      !revalidated.item.canCreateOrder ||
      revalidated.item.groupType !== 'PREORDER' ||
      revalidated.item.shippingPaymentMode !== 'FREIGHT_COLLECT' ||
      Number(revalidated.item.shippingCostAmountClp) !== 0
    )
      throw new Error('PREORDER/FREIGHT_COLLECT checkout invariants failed.');
    const order = await request(`/api/v1/checkout/groups/${state.cartGroupId}/order`, {
      body: {},
      idempotencyKey: `${runId}:order`,
      method: 'POST',
      token: clientToken,
    });
    state.orderId = order.item.orderId;
    state.orderPublicNumber = order.item.publicNumber;
    state.amountClp = Number(order.item.totalAmountClp);
    const persistedOrder = await request(`/api/v1/orders/${state.orderId}`, {
      token: clientToken,
    });
    if (
      persistedOrder.item.orderType !== 'PREORDER' ||
      persistedOrder.item.deliveryMode !== 'FREIGHT_COLLECT' ||
      persistedOrder.item.shippingIncludedInOrderTotal !== false
    )
      throw new Error('Persisted PREORDER/FREIGHT_COLLECT invariants failed.');
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
    console.log('REMOTE_PREORDER_FREIGHT_PREPARE=PASS');
    console.log(`ACCEPTANCE_RUN_ID=${runId}`);
    console.log(`ORDER_PUBLIC_NUMBER=${state.orderPublicNumber}`);
    console.log(`AMOUNT_CLP=${state.amountClp}`);
    console.log('ORDER_TYPE=PREORDER');
    console.log('DELIVERY_MODE=FREIGHT_COLLECT');
  } catch (error) {
    writeFileSync(stateUrl, `${JSON.stringify(state, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    if (state.orderId === undefined) {
      const failures = await cleanupBeforeOrder(state, adminToken, clientToken);
      if (failures.length === 0) unlinkSync(stateUrl);
      else
        throw new Error(`${error.message} :: CLEANUP_FAILED :: ${failures.join(' | ')}`, {
          cause: error,
        });
    }
    throw error;
  }
}

async function cleanupFailed() {
  const state = JSON.parse(readFileSync(stateUrl, 'utf8'));
  if (state.orderId === undefined) throw new Error('The failed run has no persisted Order.');
  const adminToken = await login(env.SERGOD_ADMIN_EMAIL, env.SERGOD_ADMIN_PASSWORD);
  const clientToken = await login(env.SERGOD_CLIENT_EMAIL, env.SERGOD_CLIENT_PASSWORD);
  const order = await request(`/api/v1/orders/${state.orderId}`, { token: clientToken });
  if (order.item.state !== 'CANCELLED')
    throw new Error(`The failed Order is not cancelled: ${order.item.state}.`);
  const campaign = await request(`/api/v1/admin/preorders/campaigns/${state.campaignId}`, {
    token: adminToken,
  });
  if (
    Number(campaign.item.committed) !== state.originalCommitted ||
    Number(campaign.item.temporarilyReserved) !== state.originalReserved
  )
    throw new Error('Failed-run preorder counters were not restored.');
  unlinkSync(stateUrl);
  console.log('REMOTE_PREORDER_FREIGHT_FAILED_CLEANUP=PASS');
  console.log(`ACCEPTANCE_RUN_ID=${state.runId}`);
  console.log(`ORDER_PUBLIC_NUMBER=${state.orderPublicNumber}`);
}

async function recoverFailed() {
  const state = JSON.parse(readFileSync(stateUrl, 'utf8'));
  if (state.orderId !== undefined) throw new Error('The failed run already identifies its Order.');
  const clientToken = await login(env.SERGOD_CLIENT_EMAIL, env.SERGOD_CLIENT_PASSWORD);
  const page = await request('/api/v1/orders?limit=25&orderType=PREORDER', { token: clientToken });
  const matches = page.items.filter(
    (order) =>
      order.state === 'PENDING_PAYMENT' &&
      order.lines.some((line) => line.preorderCampaignId === state.campaignId),
  );
  if (matches.length !== 1) throw new Error(`Expected one failed Order; found ${matches.length}.`);
  const [order] = matches;
  state.orderId = order.orderId;
  state.orderPublicNumber = order.publicNumber;
  state.amountClp = Number(order.totalAmountClp);
  writeFileSync(stateUrl, `${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  console.log('REMOTE_PREORDER_FREIGHT_FAILED_RECOVERY=PASS');
  console.log(`ACCEPTANCE_RUN_ID=${state.runId}`);
  console.log(`ORDER_PUBLIC_NUMBER=${state.orderPublicNumber}`);
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
  if (
    payment.item.status !== 'SUCCEEDED' ||
    order.item.state !== 'PAID' ||
    order.item.orderType !== 'PREORDER' ||
    order.item.deliveryMode !== 'FREIGHT_COLLECT' ||
    order.item.shippingIncludedInOrderTotal !== false
  )
    throw new Error('Paid PREORDER/FREIGHT_COLLECT verification failed.');
  const campaign = await request(`/api/v1/admin/preorders/campaigns/${state.campaignId}`, {
    token: adminToken,
  });
  if (
    Number(campaign.item.committed) !== state.originalCommitted + 1 ||
    Number(campaign.item.temporarilyReserved) !== state.originalReserved
  )
    throw new Error('Preorder commitment counters are inconsistent.');
  const fulfillment = await request(`/api/v1/orders/${state.orderId}/fulfillment`, {
    token: clientToken,
  });
  const transitions = [
    { body: { toStatus: 'PREPARING' }, status: 'PREPARING' },
    {
      body: { carrier: 'STARKEN', toStatus: 'SHIPPED', trackingCode: state.runId },
      status: 'SHIPPED',
    },
    { body: { toStatus: 'FULFILLED' }, status: 'FULFILLED' },
  ];
  for (const transition of transitions) {
    const transitioned = await request(
      `/api/v1/admin/fulfillments/${fulfillment.item.fulfillmentId}/transitions`,
      { body: transition.body, method: 'POST', token: adminToken },
    );
    if (transitioned.item.status !== transition.status)
      throw new Error(`Fulfillment did not reach ${transition.status}.`);
  }
  await campaignTransition(
    adminToken,
    state.campaignId,
    'operational',
    { nextState: 'CLOSED', reason: 'Remote acceptance completed' },
    `${state.runId}:close-campaign`,
  );
  for (const entity of [...state.changedEntities].reverse())
    await catalogTransition(adminToken, entity, 'UNPUBLISHED', state.runId);
  unlinkSync(stateUrl);
  console.log('REMOTE_PREORDER_FREIGHT_ACCEPTANCE=PASS');
  console.log(`ACCEPTANCE_RUN_ID=${state.runId}`);
  console.log(`ORDER_PUBLIC_NUMBER=${state.orderPublicNumber}`);
  console.log('PAYMENT_STATUS=SUCCEEDED');
  console.log('ORDER_STATUS=PAID');
  console.log('FULFILLMENT_STATUS=FULFILLED');
  console.log('REMOTE_PREORDER_FREIGHT_CLEANUP=PASS');
}

await (mode === '--prepare'
  ? prepare()
  : mode === '--finalize'
    ? finalize()
    : mode === '--recover-failed'
      ? recoverFailed()
      : cleanupFailed());
