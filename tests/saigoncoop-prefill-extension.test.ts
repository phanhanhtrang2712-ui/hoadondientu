import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

test('Saigon Co.op extension fills only the lookup field and leaves CAPTCHA manual', () => {
  const script = readFileSync('browser-extension/visnam-prefill/visnam-prefill.js', 'utf8');
  class FakeInput {
    type = 'text';
    disabled = false;
    value = '';
    events: string[] = [];

    constructor(public id: string, public name: string) {}
    getClientRects() { return [{}]; }
    dispatchEvent(event: { type: string }) { this.events.push(event.type); return true; }
  }

  const lookup = new FakeInput('MA_NHAN_HOA_DON', 'MA_NHAN_HOA_DON');
  const captcha = new FakeInput('CaptchaInputText', 'CaptchaInputText');
  let replacedUrl = '';

  runInNewContext(script, {
    URLSearchParams,
    HTMLInputElement: FakeInput,
    Event: class { constructor(public type: string) {} },
    location: {
      hostname: 'saigoncoop.einvoice.com.vn',
      pathname: '/',
      search: '',
      hash: '#hms_thaison_code=TESTCODE-123'
    },
    document: {
      querySelectorAll: (selector: string) => selector === 'input' ? [lookup, captcha] : []
    },
    history: {
      state: null,
      replaceState: (_state: unknown, _title: string, url: string) => { replacedUrl = url; }
    },
    setInterval: () => { throw new Error('Unexpected delayed lookup-field search'); },
    clearInterval: () => undefined,
  });

  assert.equal(lookup.value, 'TESTCODE-123');
  assert.deepEqual(lookup.events, ['input', 'change']);
  assert.equal(captcha.value, '');
  assert.equal(captcha.events.length, 0);
  assert.equal(replacedUrl, '/');
});
