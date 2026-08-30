import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const stateUrl = new URL('.runtime/codex/remote-admin-core-state.json', root);
const mode = process.argv[2];
if (!['--cleanup', '--run'].includes(mode)) throw new Error('Use --run or --cleanup.');

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
  throw new Error('Admin acceptance is restricted to the expected staging API.');

async function request(path, { body, idempotencyKey, method = 'GET', statuses, token } = {}) {
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
  const accepted = statuses ?? (response.ok ? [response.status] : []);
  if (!accepted.includes(response.status))
    throw new Error(
      `${method} ${path} :: HTTP ${response.status} :: ${payload?.error?.code ?? 'UNKNOWN'}`,
    );
  return { payload, status: response.status };
}

async function login() {
  const { payload } = await request('/api/v1/identity/sessions', {
    body: { email: env.SERGOD_ADMIN_EMAIL, password: env.SERGOD_ADMIN_PASSWORD },
    method: 'POST',
  });
  if (typeof payload?.accessToken !== 'string') throw new Error('Admin login returned no token.');
  return payload.accessToken;
}

function persist(state) {
  writeFileSync(stateUrl, `${JSON.stringify(state, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
}

function sameLoyalty(left, right) {
  return (
    Number(left.availablePoints) === Number(right.availablePoints) &&
    Number(left.balance) === Number(right.balance) &&
    Boolean(left.debt) === Boolean(right.debt) &&
    Number(left.reservedPoints) === Number(right.reservedPoints)
  );
}

function loyaltyConfigurationBody(item) {
  return {
    branchId: item.branchId,
    earnClpPerPoint: Number(item.earnClpPerPoint),
    maximumRedeemBasisPoints:
      item.maximumRedeemBasisPoints === null ? null : Number(item.maximumRedeemBasisPoints),
    minimumRedeemPoints: Number(item.minimumRedeemPoints),
    redeemClpPerPoint: Number(item.redeemClpPerPoint),
  };
}

function loyaltyConfigurationEdit(body) {
  return {
    earnClpPerPoint: body.earnClpPerPoint,
    maximumRedeemBasisPoints: body.maximumRedeemBasisPoints,
    minimumRedeemPoints: body.minimumRedeemPoints,
    redeemClpPerPoint: body.redeemClpPerPoint,
  };
}

function sameLoyaltyConfiguration(left, right) {
  return (
    left.branchId === right.branchId &&
    Number(left.earnClpPerPoint) === Number(right.earnClpPerPoint) &&
    (left.maximumRedeemBasisPoints === null
      ? right.maximumRedeemBasisPoints === null
      : Number(left.maximumRedeemBasisPoints) === Number(right.maximumRedeemBasisPoints)) &&
    Number(left.minimumRedeemPoints) === Number(right.minimumRedeemPoints) &&
    Number(left.redeemClpPerPoint) === Number(right.redeemClpPerPoint)
  );
}

async function cancelPromotionArtifacts(state, token, failures) {
  if (state.couponId !== undefined && state.couponCancelled !== true) {
    try {
      const detail = await request(`/api/v1/admin/coupons/${state.couponId}`, { token });
      if (detail.payload.item.state !== 'CANCELLED')
        await request(`/api/v1/admin/coupons/${state.couponId}/state-transitions`, {
          body: { nextState: 'CANCELLED' },
          idempotencyKey: `${state.runId}:cleanup-coupon`,
          method: 'POST',
          token,
        });
      state.couponCancelled = true;
      persist(state);
    } catch (error) {
      failures.push(error.message);
    }
  }
  if (state.promotionId !== undefined && state.promotionCancelled !== true) {
    try {
      const detail = await request(`/api/v1/admin/promotions/${state.promotionId}`, { token });
      if (detail.payload.item.state !== 'CANCELLED')
        await request(`/api/v1/admin/promotions/${state.promotionId}/state-transitions`, {
          body: { nextState: 'CANCELLED' },
          idempotencyKey: `${state.runId}:cleanup-promotion`,
          method: 'POST',
          token,
        });
      state.promotionCancelled = true;
      persist(state);
    } catch (error) {
      failures.push(error.message);
    }
  }
}

async function cleanup(state, token) {
  const failures = [];
  if (state.clientDeactivated === true) {
    try {
      await request(`/api/v1/admin/accounts/${state.clientAccountId}/reactivate`, {
        body: { reason: `${state.runId} cleanup restore active client` },
        method: 'POST',
        token,
      });
      state.clientDeactivated = false;
      persist(state);
    } catch (error) {
      failures.push(error.message);
    }
  }
  if (state.productChanged === true) {
    try {
      await request(`/api/v1/admin/catalog/products/${state.productId}`, {
        body: { description: state.originalProductDescription },
        idempotencyKey: `${state.runId}:cleanup-product`,
        method: 'PATCH',
        token,
      });
      state.productChanged = false;
      persist(state);
    } catch (error) {
      failures.push(error.message);
    }
  }
  await cancelPromotionArtifacts(state, token, failures);
  if (state.loyaltyIncrementApplied === true && state.loyaltyIncrementReverted !== true) {
    try {
      await request(`/api/v1/admin/loyalty/accounts/${state.clientAccountId}/corrections`, {
        body: { pointsSigned: -1, reason: `${state.runId} cleanup compensated correction` },
        idempotencyKey: `${state.runId}:cleanup-loyalty`,
        method: 'POST',
        token,
      });
      state.loyaltyIncrementReverted = true;
      persist(state);
    } catch (error) {
      failures.push(error.message);
    }
  }
  if (state.editorialEntryId !== undefined && state.editorialArchived !== true) {
    try {
      await request(`/api/v1/admin/content/${state.editorialEntryId}/archive`, {
        method: 'POST',
        token,
      });
      state.editorialArchived = true;
      persist(state);
    } catch (error) {
      failures.push(error.message);
    }
  }
  if (state.loyaltyConfigurationId !== undefined && state.loyaltyConfigurationActivated !== true) {
    try {
      await request(`/api/v1/admin/loyalty/configurations/${state.loyaltyConfigurationId}`, {
        body: loyaltyConfigurationEdit(state.originalLoyaltyConfiguration),
        idempotencyKey: `${state.runId}:cleanup-loyalty-config-restore`,
        method: 'PATCH',
        token,
      });
      await request(
        `/api/v1/admin/loyalty/configurations/${state.loyaltyConfigurationId}/state-transitions`,
        {
          body: { nextState: 'ACTIVE' },
          idempotencyKey: `${state.runId}:cleanup-loyalty-config-activate`,
          method: 'POST',
          token,
        },
      );
      state.loyaltyConfigurationActivated = true;
      persist(state);
    } catch (error) {
      failures.push(error.message);
    }
  }
  if (state.systemConfigurationId !== undefined && state.systemConfigurationActivated !== true) {
    try {
      await request(`/api/v1/admin/system-configurations/${state.systemConfigurationId}`, {
        body: { reason: `${state.runId} cleanup restore value`, value: state.systemOriginalValue },
        idempotencyKey: `${state.runId}:cleanup-system-config-restore`,
        method: 'PATCH',
        token,
      });
      await request(
        `/api/v1/admin/system-configurations/${state.systemConfigurationId}/state-transitions`,
        {
          body: { nextState: 'ACTIVE', reason: `${state.runId} cleanup activate restored value` },
          idempotencyKey: `${state.runId}:cleanup-system-config-activate`,
          method: 'POST',
          token,
        },
      );
      state.systemConfigurationActivated = true;
      persist(state);
    } catch (error) {
      failures.push(error.message);
    }
  }
  return failures;
}

async function run() {
  try {
    readFileSync(stateUrl, 'utf8');
    throw new Error('An Admin acceptance state already exists.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const state = {
    runId: `ACCEPT-ADMIN-CORE-${new Date().toISOString().replace(/\D/gu, '').slice(0, 14)}`,
  };
  persist(state);
  const token = await login();
  try {
    const accounts = (await request('/api/v1/admin/accounts', { token })).payload.accounts;
    const client = accounts.find(
      (account) => account.role === 'CLIENTE' && account.currentEmail === env.SERGOD_CLIENT_EMAIL,
    );
    if (client === undefined || client.status !== 'ACTIVE')
      throw new Error('The technical client account is missing or inactive.');
    state.clientAccountId = client.accountId;
    const products = (await request('/api/v1/admin/catalog/products?limit=100', { token })).payload
      .items;
    const product = products.find(
      (item) => item.name.startsWith('Phase 3F') && item.publicationStatus === 'UNPUBLISHED',
    );
    if (product === undefined) throw new Error('The unpublished technical product is missing.');
    state.productId = product.productId;
    state.originalProductDescription = product.description;
    persist(state);

    await request(`/api/v1/admin/catalog/products/${state.productId}`, {
      body: { description: `${state.runId} reversible catalog edit` },
      idempotencyKey: `${state.runId}:catalog-edit`,
      method: 'PATCH',
      token,
    });
    state.productChanged = true;
    persist(state);
    const editedProduct = await request(`/api/v1/admin/catalog/products/${state.productId}`, {
      token,
    });
    if (editedProduct.payload.item.description !== `${state.runId} reversible catalog edit`)
      throw new Error('Catalog edit was not persisted.');
    await request(`/api/v1/admin/catalog/products/${state.productId}`, {
      body: { description: state.originalProductDescription },
      idempotencyKey: `${state.runId}:catalog-restore`,
      method: 'PATCH',
      token,
    });
    state.productChanged = false;
    persist(state);

    await request(`/api/v1/admin/accounts/${state.clientAccountId}/deactivate`, {
      body: { reason: `${state.runId} reversible account state acceptance` },
      method: 'POST',
      token,
    });
    state.clientDeactivated = true;
    persist(state);
    const deactivated = (await request('/api/v1/admin/accounts', { token })).payload.accounts.find(
      (account) => account.accountId === state.clientAccountId,
    );
    if (deactivated?.status !== 'DEACTIVATED') throw new Error('Client was not deactivated.');
    await request(`/api/v1/admin/accounts/${state.clientAccountId}/reactivate`, {
      body: { reason: `${state.runId} restore active client` },
      method: 'POST',
      token,
    });
    state.clientDeactivated = false;
    persist(state);

    const startsAt = new Date(Date.now() - 60_000).toISOString();
    const endsAt = new Date(Date.now() + 30 * 60_000).toISOString();
    const promotionBody = {
      activationMode: 'COUPON_REQUIRED',
      benefit: { basisPoints: 100, type: 'PERCENTAGE_DISCOUNT' },
      branchId: null,
      channel: 'BOTH',
      endsAt,
      globalLimit: 1,
      minimumEligibleAmountClp: null,
      minimumEligibleQuantity: null,
      name: `${state.runId} promotion`,
      perAccountLimit: 1,
      priority: -1000,
      schedules: [],
      scope: 'ORDER',
      startsAt,
      targets: [
        {
          categoryId: null,
          gameId: null,
          kind: 'ALL_PRODUCTS',
          position: 1,
          productId: null,
          side: 'BENEFITED',
        },
      ],
    };
    const promotion = await request('/api/v1/admin/promotions', {
      body: promotionBody,
      idempotencyKey: `${state.runId}:promotion-create`,
      method: 'POST',
      token,
    });
    state.promotionId = promotion.payload.item.promotionId;
    persist(state);
    await request(`/api/v1/admin/promotions/${state.promotionId}`, {
      body: { ...promotionBody, name: `${state.runId} promotion edited` },
      idempotencyKey: `${state.runId}:promotion-edit`,
      method: 'PATCH',
      token,
    });
    await request(`/api/v1/admin/promotions/${state.promotionId}/state-transitions`, {
      body: { nextState: 'ACTIVE' },
      idempotencyKey: `${state.runId}:promotion-activate`,
      method: 'POST',
      token,
    });
    const coupon = await request('/api/v1/admin/coupons', {
      body: {
        code: `ACCEPT${state.runId.slice(-8)}`,
        endsAt,
        globalLimit: 1,
        perAccountLimit: 1,
        promotionId: state.promotionId,
        startsAt,
      },
      idempotencyKey: `${state.runId}:coupon-create`,
      method: 'POST',
      token,
    });
    state.couponId = coupon.payload.item.couponId;
    persist(state);
    await request(`/api/v1/admin/coupons/${state.couponId}/state-transitions`, {
      body: { nextState: 'ACTIVE' },
      idempotencyKey: `${state.runId}:coupon-activate`,
      method: 'POST',
      token,
    });
    await request(`/api/v1/admin/coupons/${state.couponId}/state-transitions`, {
      body: { nextState: 'CANCELLED' },
      idempotencyKey: `${state.runId}:coupon-cancel`,
      method: 'POST',
      token,
    });
    state.couponCancelled = true;
    persist(state);
    await request(`/api/v1/admin/promotions/${state.promotionId}/state-transitions`, {
      body: { nextState: 'CANCELLED' },
      idempotencyKey: `${state.runId}:promotion-cancel`,
      method: 'POST',
      token,
    });
    state.promotionCancelled = true;
    persist(state);

    const loyaltyBefore = await request(`/api/v1/admin/loyalty/accounts/${state.clientAccountId}`, {
      token,
    });
    state.originalLoyaltyAccount = loyaltyBefore.payload.item;
    persist(state);
    await request(`/api/v1/admin/loyalty/accounts/${state.clientAccountId}/corrections`, {
      body: { pointsSigned: 1, reason: `${state.runId} compensated correction` },
      idempotencyKey: `${state.runId}:loyalty-plus`,
      method: 'POST',
      token,
    });
    state.loyaltyIncrementApplied = true;
    persist(state);
    await request(`/api/v1/admin/loyalty/accounts/${state.clientAccountId}/corrections`, {
      body: { pointsSigned: -1, reason: `${state.runId} compensated correction restore` },
      idempotencyKey: `${state.runId}:loyalty-minus`,
      method: 'POST',
      token,
    });
    state.loyaltyIncrementReverted = true;
    persist(state);
    const loyaltyAfter = await request(`/api/v1/admin/loyalty/accounts/${state.clientAccountId}`, {
      token,
    });
    if (!sameLoyalty(state.originalLoyaltyAccount, loyaltyAfter.payload.item))
      throw new Error('Compensated loyalty correction did not restore the account.');

    const loyaltyConfigurations = (
      await request('/api/v1/admin/loyalty/configurations?limit=100', { token })
    ).payload.items;
    const activeLoyalty = loyaltyConfigurations.find((item) => item.state === 'ACTIVE');
    if (activeLoyalty === undefined) throw new Error('No active loyalty configuration exists.');
    state.originalLoyaltyConfiguration = loyaltyConfigurationBody(activeLoyalty);
    const loyaltyConfiguration = await request('/api/v1/admin/loyalty/configurations', {
      body: state.originalLoyaltyConfiguration,
      idempotencyKey: `${state.runId}:loyalty-config-create`,
      method: 'POST',
      token,
    });
    state.loyaltyConfigurationId = loyaltyConfiguration.payload.item.loyaltyConfigurationId;
    persist(state);
    await request(`/api/v1/admin/loyalty/configurations/${state.loyaltyConfigurationId}`, {
      body: {
        ...loyaltyConfigurationEdit(state.originalLoyaltyConfiguration),
        minimumRedeemPoints: state.originalLoyaltyConfiguration.minimumRedeemPoints + 1,
      },
      idempotencyKey: `${state.runId}:loyalty-config-edit`,
      method: 'PATCH',
      token,
    });
    await request(`/api/v1/admin/loyalty/configurations/${state.loyaltyConfigurationId}`, {
      body: loyaltyConfigurationEdit(state.originalLoyaltyConfiguration),
      idempotencyKey: `${state.runId}:loyalty-config-restore`,
      method: 'PATCH',
      token,
    });
    await request(
      `/api/v1/admin/loyalty/configurations/${state.loyaltyConfigurationId}/state-transitions`,
      {
        body: { nextState: 'ACTIVE' },
        idempotencyKey: `${state.runId}:loyalty-config-activate`,
        method: 'POST',
        token,
      },
    );
    state.loyaltyConfigurationActivated = true;
    persist(state);

    const [definitions, systemVersions] = await Promise.all([
      request('/api/v1/admin/system-configurations/definitions', { token }),
      request('/api/v1/admin/system-configurations?limit=100', { token }),
    ]);
    const activeSystem = systemVersions.payload.items.find(
      (item) => item.state === 'ACTIVE' && typeof item.value === 'number',
    );
    if (activeSystem === undefined)
      throw new Error('No active integer system configuration exists.');
    const definition = (definitions.payload.items ?? definitions.payload.definitions).find(
      (item) => item.key === activeSystem.configurationKey,
    );
    state.systemConfigurationKey = activeSystem.configurationKey;
    state.systemOriginalValue = Number(activeSystem.value);
    const higher = state.systemOriginalValue + 1;
    state.systemTemporaryValue =
      definition.maximum === undefined || higher <= definition.maximum
        ? higher
        : state.systemOriginalValue - 1;
    const systemConfiguration = await request('/api/v1/admin/system-configurations', {
      body: {
        configurationKey: state.systemConfigurationKey,
        reason: `${state.runId} create same-value version`,
        value: state.systemOriginalValue,
      },
      idempotencyKey: `${state.runId}:system-config-create`,
      method: 'POST',
      token,
    });
    state.systemConfigurationId = systemConfiguration.payload.item.systemConfigurationId;
    persist(state);
    await request(`/api/v1/admin/system-configurations/${state.systemConfigurationId}`, {
      body: { reason: `${state.runId} reversible edit`, value: state.systemTemporaryValue },
      idempotencyKey: `${state.runId}:system-config-edit`,
      method: 'PATCH',
      token,
    });
    await request(`/api/v1/admin/system-configurations/${state.systemConfigurationId}`, {
      body: { reason: `${state.runId} restore original value`, value: state.systemOriginalValue },
      idempotencyKey: `${state.runId}:system-config-restore`,
      method: 'PATCH',
      token,
    });
    await request(
      `/api/v1/admin/system-configurations/${state.systemConfigurationId}/state-transitions`,
      {
        body: { nextState: 'ACTIVE', reason: `${state.runId} activate unchanged value` },
        idempotencyKey: `${state.runId}:system-config-activate`,
        method: 'POST',
        token,
      },
    );
    state.systemConfigurationActivated = true;
    persist(state);

    const editorialBody = {
      body: `${state.runId} technical editorial body`,
      excerpt: `${state.runId} technical excerpt`,
      metadata: { acceptanceRunId: state.runId },
      slug: state.runId.toLowerCase(),
      title: `${state.runId} editorial`,
      type: 'NEWS',
    };
    const editorial = await request('/api/v1/admin/content', {
      body: editorialBody,
      method: 'POST',
      token,
    });
    state.editorialEntryId = editorial.payload.item.editorialEntryId;
    persist(state);
    await request(`/api/v1/admin/content/${state.editorialEntryId}`, {
      body: { ...editorialBody, title: `${state.runId} editorial edited` },
      method: 'PUT',
      token,
    });
    await request(`/api/v1/admin/content/${state.editorialEntryId}/publish`, {
      method: 'POST',
      token,
    });
    const published = await request(`/api/v1/content/${editorialBody.slug}`);
    if (published.payload.item.status !== 'PUBLISHED')
      throw new Error('Editorial content was not published.');
    await request(`/api/v1/admin/content/${state.editorialEntryId}/archive`, {
      method: 'POST',
      token,
    });
    state.editorialArchived = true;
    persist(state);
    await request(`/api/v1/content/${editorialBody.slug}`, { statuses: [404] });

    const finalAccounts = (await request('/api/v1/admin/accounts', { token })).payload.accounts;
    if (
      finalAccounts.find((account) => account.accountId === state.clientAccountId)?.status !==
      'ACTIVE'
    )
      throw new Error('Client account was not restored to ACTIVE.');
    const finalProduct = await request(`/api/v1/admin/catalog/products/${state.productId}`, {
      token,
    });
    if (finalProduct.payload.item.description !== state.originalProductDescription)
      throw new Error('Technical product was not restored.');
    const finalLoyaltyActive = await request(
      `/api/v1/admin/loyalty/configurations/active?branchId=${state.originalLoyaltyConfiguration.branchId}`,
      { token },
    );
    if (
      finalLoyaltyActive.payload.item.loyaltyConfigurationId !== state.loyaltyConfigurationId ||
      !sameLoyaltyConfiguration(
        state.originalLoyaltyConfiguration,
        loyaltyConfigurationBody(finalLoyaltyActive.payload.item),
      )
    )
      throw new Error('Loyalty configuration did not retain the original operational value.');
    const finalSystemActive = await request(
      `/api/v1/admin/system-configurations/active?configurationKey=${state.systemConfigurationKey}`,
      { token },
    );
    if (
      finalSystemActive.payload.item.systemConfigurationId !== state.systemConfigurationId ||
      Number(finalSystemActive.payload.item.value) !== state.systemOriginalValue
    )
      throw new Error('System configuration did not retain the original operational value.');
    const audit = await request('/api/v1/admin/audit-entries?limit=100&result=SUCCESS', { token });
    const traced = audit.payload.items.filter((entry) => entry.reason?.includes(state.runId));
    if (traced.length < 6)
      throw new Error(`Only ${traced.length} traced audit entries were found.`);

    unlinkSync(stateUrl);
    console.log('REMOTE_ADMIN_CORE_ACCEPTANCE=PASS');
    console.log(`ACCEPTANCE_RUN_ID=${state.runId}`);
    console.log('CATALOG_EDIT_RESTORE=PASS');
    console.log('CLIENT_DEACTIVATE_REACTIVATE=PASS');
    console.log('PROMOTION_COUPON_LIFECYCLE=PASS');
    console.log('LOYALTY_CORRECTION_COMPENSATION=PASS');
    console.log('LOYALTY_CONFIGURATION_SAME_VALUE_ACTIVATION=PASS');
    console.log('SYSTEM_CONFIGURATION_SAME_VALUE_ACTIVATION=PASS');
    console.log('EDITORIAL_PUBLISH_ARCHIVE=PASS');
    console.log(`TRACED_AUDIT_ENTRIES=${traced.length}`);
  } catch (error) {
    const failures = await cleanup(state, token);
    if (failures.length > 0)
      throw new Error(`${error.message} :: CLEANUP_FAILED :: ${failures.join(' | ')}`, {
        cause: error,
      });
    throw error;
  }
}

if (mode === '--run') await run();
else {
  const state = JSON.parse(readFileSync(stateUrl, 'utf8'));
  const token = await login();
  const failures = await cleanup(state, token);
  if (failures.length > 0) throw new Error(`CLEANUP_FAILED :: ${failures.join(' | ')}`);
  unlinkSync(stateUrl);
  console.log('REMOTE_ADMIN_CORE_CLEANUP=PASS');
  console.log(`ACCEPTANCE_RUN_ID=${state.runId}`);
}
