import test from 'node:test';
import assert from 'node:assert/strict';
import { preorderState, preorderFamily } from '../lib/preorders';
import type { Product } from '../lib/types';

test('La reserva abre en el instante de apertura y se cierra en el de cierre', () => {
  const p = { opens_at: '2030-10-07T12:00:00Z', closes_at: '2030-10-08T12:00:00Z', available: 3 };
  const opening = Date.parse(p.opens_at),
    closing = Date.parse(p.closes_at);
  assert.equal(preorderState(p, opening - 1), 'upcoming');
  assert.equal(preorderState(p, opening), 'open');
  assert.equal(preorderState({ ...p, available: 0 }, opening), 'sold-out');
  assert.equal(preorderState(p, closing), 'closed');
  assert.equal(preorderState({ ...p, opens_at: null }, opening), 'unconfigured');
  assert.equal(preorderState({ ...p, closes_at: 'incorrecta' }, opening), 'unconfigured');
  assert.equal(preorderState({ ...p, closes_at: p.opens_at }, opening), 'unconfigured');
});

test('La familia no presenta fechas y entrega diferentes como una condición común', () => {
  const now = Date.parse('2030-10-07T13:00:00Z');
  const a = {
    opens_at: '2030-10-07T12:00:00Z',
    closes_at: '2030-10-08T12:00:00Z',
    available: 3,
    delivery_terms: 'Retiro al llegar',
  } as Product;
  const b = {
    ...a,
    opens_at: '2030-10-09T12:00:00Z',
    closes_at: '2030-10-10T12:00:00Z',
    available: 8,
    delivery_terms: 'Entrega en noviembre',
  };
  const result = preorderFamily([a, b], now);
  assert.equal(result.state, 'open');
  assert.equal(result.available, 3);
  assert.equal(result.opensAt, null);
  assert.equal(result.closesAt, null);
  assert.equal(result.deliveryTerms, null);
  const common = preorderFamily([a, { ...a, available: 2 }], now);
  assert.equal(common.available, 5);
  assert.equal(common.closesAt, a.closes_at);
});
