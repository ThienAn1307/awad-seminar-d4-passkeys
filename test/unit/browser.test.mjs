// CDP's WebAuthn domain returns credential IDs in standard base64; the page and the
// app use base64url (spike, test C1). Comparing them unconverted silently never matches.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { base64ToBase64url, isLocalUrl } from '../../harness/browser.mjs';

test('base64 from CDP becomes base64url without padding', () => {
  assert.equal(base64ToBase64url('a+b/c9=='), 'a-b_c9');
});

test('an id that is already url-safe is unchanged', () => {
  assert.equal(base64ToBase64url('abc_-9'), 'abc_-9');
});

test('only localhost and 127.0.0.1 count as local; any other host is blocked', () => {
  assert.equal(isLocalUrl('http://localhost:4123/signin'), true);
  assert.equal(isLocalUrl('http://127.0.0.1:4123/api/me'), true);
  assert.equal(isLocalUrl('https://example.com/.well-known/webauthn'), false);
  assert.equal(isLocalUrl('http://localhost.evil.test/'), false);
});

test('data and blob urls made by the page itself are local', () => {
  assert.equal(isLocalUrl('data:text/plain,hi'), true);
  assert.equal(isLocalUrl('blob:http://localhost:4123/0f1e'), true);
});
