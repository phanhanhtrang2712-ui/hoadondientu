import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSaigonCoopPrefillUrl,
  isSaigonCoopPortalUrl,
} from '../src/utils/providerIdentity';

test('Saigon Co.op lookup link carries the code only in its URL fragment', () => {
  const portal = 'https://saigoncoop.einvoice.com.vn/';
  const code = '0323797ABC-021';
  const result = buildSaigonCoopPrefillUrl(portal, code);
  const url = new URL(result);

  assert.equal(isSaigonCoopPortalUrl(portal), true);
  assert.equal(url.origin, portal.slice(0, -1));
  assert.equal(url.search, '');
  assert.equal(new URLSearchParams(url.hash.slice(1)).get('hms_thaison_code'), code);
});

test('Saigon Co.op prefill is restricted to its verified HTTPS tenant portal', () => {
  assert.equal(isSaigonCoopPortalUrl('http://saigoncoop.einvoice.com.vn/'), true);
  assert.equal(isSaigonCoopPortalUrl('https://einvoice.vn/tra-cuu'), false);
  assert.equal(isSaigonCoopPortalUrl('https://example.einvoice.com.vn/'), false);
  assert.equal(buildSaigonCoopPrefillUrl('https://example.einvoice.com.vn/', 'lookup-123'), '');
});
