// Run order from docs/method.md section 9.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abbaOrder } from '../../harness/order.mjs';

test('5 runs per arm give A B B A A B B A A B', () => {
  assert.deepEqual(abbaOrder(5).map((a) => (a === 'baseline' ? 'A' : 'B')).join(''), 'ABBAABBAAB');
});

test('each arm gets exactly the requested number of runs', () => {
  const order = abbaOrder(5);
  assert.equal(order.filter((a) => a === 'baseline').length, 5);
  assert.equal(order.filter((a) => a === 'change').length, 5);
});
