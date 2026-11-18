import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createSaigonCoopManualCaptcha,
  submitSaigonCoopManualLookup,
} from '../src/services/saigonCoopInvoiceService';
import { isSaigonCoopPortalUrl } from '../src/utils/providerIdentity';

const lookupPage = `<!doctype html><html><body>
  <form action="/xem-hoa-don" method="post">
    <input type="hidden" name="__RequestVerificationToken" value="request-token">
    <input type="hidden" id="CaptchaDeText" name="CaptchaDeText" value="captcha-token">
    <input type="text" name="MA_NHAN_HOA_DON" id="MA_NHAN_HOA_DON">
    <img id="CaptchaImage" src="/DefaultCaptcha/Generate?t=captcha-token">
    <input type="text" name="CaptchaInputText" id="CaptchaInputText">
  </form>
</body></html>`;

const invoicePage = `<!doctype html><html><body>
  <h1>Hóa đơn điện tử Saigon Co.op</h1>
  <p>MST người bán: 0301175691021</p>
  <p>Ký hiệu C26MCM, số hóa đơn 0323797</p>
  <table>
    <tr><th>Tên hàng</th></tr>
    <tr><td>Dịch vụ</td></tr>
    <tr><td>Tổng cộng</td></tr>
  </table>
</body></html>`;

test('only routes the Saigon Co.op tenant portal to the in-app CAPTCHA flow', () => {
  assert.equal(isSaigonCoopPortalUrl('https://saigoncoop.einvoice.com.vn/'), true);
  assert.equal(isSaigonCoopPortalUrl('https://einvoice.vn/tra-cuu'), false);
  assert.equal(isSaigonCoopPortalUrl('https://another-customer.einvoice.com.vn/'), false);
});

test('Saigon Co.op manual challenge keeps portal cookies and submits only the user CAPTCHA', async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    requests.push({ url, init });
    if (url === 'https://saigoncoop.einvoice.com.vn/') {
      return new Response(lookupPage, {
        headers: {
          'content-type': 'text/html',
          'set-cookie': 'ASP.NET_SessionId=session-value; Path=/; HttpOnly',
        },
      });
    }
    if (url.startsWith('https://saigoncoop.einvoice.com.vn/DefaultCaptcha/Generate')) {
      return new Response(new Uint8Array(100).fill(1), {
        headers: {
          'content-type': 'image/png',
          'set-cookie': 'CaptchaSession=captcha-value; Path=/',
        },
      });
    }
    if (url === 'https://saigoncoop.einvoice.com.vn/xem-hoa-don') {
      const body = new URLSearchParams(String(init?.body || ''));
      const headers = init?.headers as Record<string, string>;
      assert.equal(body.get('__RequestVerificationToken'), 'request-token');
      assert.equal(body.get('CaptchaDeText'), 'captcha-token');
      assert.equal(body.get('MA_NHAN_HOA_DON'), 'TESTCODE123');
      assert.equal(body.get('CaptchaInputText'), 'USERANSWER');
      assert.match(headers.Cookie, /ASP\.NET_SessionId=session-value/);
      assert.match(headers.Cookie, /CaptchaSession=captcha-value/);
      return new Response(invoicePage, { headers: { 'content-type': 'text/html' } });
    }
    throw new Error('Unexpected provider request: ' + url);
  };

  try {
    const challenge = await createSaigonCoopManualCaptcha('TESTCODE123');
    assert.match(challenge.image, /^data:image\/png;base64,/);
    assert.ok(challenge.state.length > 0);

    const result = await submitSaigonCoopManualLookup({
      state: challenge.state,
      lookupCode: 'TESTCODE123',
      captcha: 'USERANSWER',
      sellerTaxCode: '0301175691-021',
      invoiceNo: '0323797',
      invoiceSeries: 'C26MCM',
    });

    assert.equal(result.kind, 'html');
    if (result.kind === 'html') {
      assert.match(result.html, /Hóa đơn điện tử Saigon Co\.op/);
      assert.doesNotMatch(result.html, /CaptchaInputText|request-token/);
    }
    assert.equal(requests.length, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Saigon Co.op challenge cannot be reused with a different lookup code', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url === 'https://saigoncoop.einvoice.com.vn/') {
      return new Response(lookupPage, {
        headers: {
          'content-type': 'text/html',
          'set-cookie': 'ASP.NET_SessionId=session-value; Path=/',
        },
      });
    }
    if (url.startsWith('https://saigoncoop.einvoice.com.vn/DefaultCaptcha/Generate')) {
      return new Response(new Uint8Array(100).fill(1), { headers: { 'content-type': 'image/png' } });
    }
    throw new Error('Unexpected provider request: ' + url);
  };

  try {
    const challenge = await createSaigonCoopManualCaptcha('TESTCODE123');
    await assert.rejects(submitSaigonCoopManualLookup({
      state: challenge.state,
      lookupCode: 'DIFFERENTCODE',
      captcha: 'USERANSWER',
      sellerTaxCode: '0301175691-021',
      invoiceNo: '0323797',
      invoiceSeries: 'C26MCM',
    }), { code: 'CAPTCHA_EXPIRED' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
