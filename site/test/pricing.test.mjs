import test from 'node:test';
import assert from 'node:assert/strict';
import { PRO_PLAN, billingCopy } from '../public/js/pricing-data.js';

test('monthly Pro shows the requested actual price and standard price', () => {
  const copy = billingCopy('monthly');
  assert.equal(copy.price, '$19.99');
  assert.equal(copy.standard, '$69');
  assert.equal(copy.charge, '$19.99/month');
  assert.equal(copy.saving, 'Save $49.01 every month');
});

test('yearly pricing uses the annual charge for its equivalent and savings', () => {
  const copy = billingCopy('yearly');
  assert.equal(copy.total, 14900);
  assert.equal(copy.price, '$12.42');
  assert.equal(copy.standard, '$20.75');
  assert.equal(copy.billing, 'Billed $149/year.');
  assert.equal(copy.saving, 'Save $100 a year');
  assert.equal(copy.discount, '38% less yearly');
});

test('both plans renew the same five-hour interview allowance monthly', () => {
  for (const period of ['monthly', 'yearly']) {
    assert.equal(billingCopy(period).allowance, '10 × 30-minute interviews every month');
    assert.equal(billingCopy(period).liveHours, 5);
  }
  assert.equal(PRO_PLAN.interviewsPerMonth, 10);
  assert.throws(() => billingCopy('weekly'), RangeError);
});
