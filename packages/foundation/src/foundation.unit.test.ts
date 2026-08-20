import { describe, expect, it } from 'vitest';

import { FixedClock, MoneyClp, entityId } from './index.js';

describe('foundation primitives', () => {
  it('serializes CLP as an integer', () => {
    const money = MoneyClp.fromInteger(12_345);

    expect(JSON.stringify({ money })).toBe('{"money":12345}');
    expect(money.add(MoneyClp.fromInteger(5)).toInteger()).toBe(12_350);
    expect(() => MoneyClp.fromInteger(10.5)).toThrow(RangeError);
  });

  it('uses a deterministic clock when injected', () => {
    const clock = new FixedClock(new Date('2026-07-31T12:00:00.000Z'));

    expect(clock.now().toISOString()).toBe('2026-07-31T12:00:00.000Z');
    clock.set(new Date('2026-08-01T00:00:00.000Z'));
    expect(clock.now().toISOString()).toBe('2026-08-01T00:00:00.000Z');
  });

  it('accepts stable UUID identifiers and rejects arbitrary text', () => {
    expect(entityId<'Test'>('0198a8be-6677-7000-8000-000000000001')).toBe(
      '0198a8be-6677-7000-8000-000000000001',
    );
    expect(() => entityId<'Test'>('not-an-id')).toThrow(RangeError);
  });
});
