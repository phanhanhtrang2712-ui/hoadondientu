import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchVisnamCaptcha, fetchVisnamInvoicePdf } from '../src/services/visnamClient';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

test('Visnam client requests a fresh CAPTCHA from the app API', async () => {
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), '/api/visnam/captcha');
    assert.equal(init?.method, 'POST');
    return new Response(JSON.stringify({
      success: true,
      key: '123e4567-e89b-12d3-a456-426614174000',
      image: 'data:image/png;base64,aGVsbG8='
    }), { headers: { 'Content-Type': 'application/json' } });
  };

  assert.deepEqual(await fetchVisnamCaptcha(), {
    key: '123e4567-e89b-12d3-a456-426614174000',
    image: 'data:image/png;base64,aGVsbG8='
  });
});

test('Visnam client submits the XML secret and invoice identity, then returns PDF', async () => {
  const expectedPdf = '%PDF-1.4\nfixture';
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), '/api/visnam/lookup');
    assert.equal(init?.method, 'POST');
    const body = JSON.parse(String(init?.body));
    assert.equal(body.key, '123e4567-e89b-12d3-a456-426614174000');
    assert.equal(body.captcha, 'A1B2');
    assert.equal(body.maSoBiMat, '22U5ZRCE8EQY');
    assert.deepEqual(body.identity, {
      sellerTaxCode: '0401926013', invoiceSeries: 'C26TAA', invoiceNo: '5235'
    });
    return new Response(JSON.stringify({
      success: true,
      pdfBase64: Buffer.from(expectedPdf).toString('base64'),
      filename: '0401926013-1C26TAA-0005235.pdf'
    }), { headers: { 'Content-Type': 'application/json' } });
  };

  const result = await fetchVisnamInvoicePdf({
    key: '123e4567-e89b-12d3-a456-426614174000',
    captcha: ' A1B2 ',
    lookupCode: ' 22U5ZRCE8EQY ',
    identity: { sellerTaxCode: '0401926013', invoiceSeries: 'C26TAA', invoiceNo: '5235' }
  });
  assert.equal(result.filename, '0401926013-1C26TAA-0005235.pdf');
  assert.equal(result.blob.type, 'application/pdf');
  assert.equal(await result.blob.text(), expectedPdf);
});
