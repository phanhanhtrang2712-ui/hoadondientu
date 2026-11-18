import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jsPDF } from 'jspdf';
import { MatbaoDriver, matbaoPdfProxyFromViewer, matbaoPdfUrlFromLookupResult } from '../src/services/invoice-engine/drivers/MatbaoDriver';
import { OriginalInvoiceError } from '../src/services/invoice-engine/OriginalInvoiceError';
import { detectProvider } from '../src/services/invoice-engine/providerDetector';
import { resolveInvoiceProvider } from '../src/utils/providerRouting';
import { extractLookupDetailsFromXml } from '../src/utils/xmlParser';
import { InvoiceDownloaderManager } from '../src/services/invoice-engine/InvoiceDownloaderManager';

const rawXml = [
  '<HDon><DLHDon><TTChung><KHMSHDon>2</KHMSHDon><KHHDon>C26MLS</KHHDon>',
  '<SHDon>3622</SHDon><NLap>2026-08-10</NLap><MSTTCGP>0302712571</MSTTCGP></TTChung>',
  '<NDHDon><NBan><Ten>Seller</Ten><MST>027098005024</MST></NBan></NDHDon>',
  '</DLHDon><MCCQT>M2-26-TEST</MCCQT></HDon>',
].join('');

test('Matbao XML identifies solution provider and uses XML-derived FKey lookup', async () => {
  const driver = new MatbaoDriver();
  assert.equal(detectProvider(rawXml), 'MATBAO');
  assert.equal(resolveInvoiceProvider({rawXml}), 'MATBAO');
  assert.equal(driver.canHandle(rawXml), true);
  assert.equal(driver.canHandle({provider:'MATBAO',rawXml} as any), true);
  assert.equal(driver.canHandle('https://portal-group1.mifi.vn/'), true);
  assert.equal(extractLookupDetailsFromXml(rawXml).lookupCode, '');
  const info = driver.extractInfo(rawXml);
  assert.equal(info.provider, 'MATBAO');
  assert.equal(info.sellerTaxCode, '027098005024');
  assert.equal(info.invoiceNo, '3622');
  assert.equal(info.invoiceSeries, 'C26MLS');
  assert.equal(info.lookupCode, '');
  assert.equal(info.rawXml, rawXml);
  assert.equal(info.lookupUrl, 'https://matbao.in/tra-cuu-hoa-don');
  assert.equal((await new InvoiceDownloaderManager().selectDriver(rawXml)).providerCode, 'MATBAO');
});

test('Matbao: missing FKey returns official XML-lookup fallback', async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ fkey: null }), {
    status: 200, headers: { 'Content-Type': 'application/json' }
  });
  try {
    const driver = new MatbaoDriver();
    await assert.rejects(driver.fetchPdf(driver.extractInfo(rawXml)),
      (error: unknown) => {
        assert.ok(error instanceof OriginalInvoiceError);
        assert.equal(error.provider, 'MATBAO');
        assert.equal(error.code, 'MATBAO_FKEY_NOT_FOUND');
        assert.equal(error.lookupUrl, 'https://matbao.in/tra-cuu-hoa-don');
        assert.match(error.message, /Tra cứu dùng file XML/);
        return true;
      });
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test('Matbao: resolves FKey from XML metadata and validates invoice before requesting PDF', async () => {
  const oldFetch = globalThis.fetch;
  let pdfRequests = 0;
  globalThis.fetch = (async (request: RequestInfo | URL) => {
    const url = new URL(String(request));
    if (url.pathname.endsWith('/fkey')) {
      assert.equal(url.searchParams.get('taxcode'), '027098005024');
      assert.equal(url.searchParams.get('pattern'), '2');
      assert.equal(url.searchParams.get('serial'), 'C26MLS');
      assert.equal(url.searchParams.get('no'), '3622');
      return new Response(JSON.stringify({ fkey: 'ABCDE12345' }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      });
    }
    if (url.pathname === '/api/tra-cuu-hoa-don') {
      assert.equal(url.searchParams.get('code'), 'ABCDE12345');
      assert.equal(url.searchParams.get('keyword'), '');
      assert.equal(url.searchParams.get('token'), 'captcha-token');
      return new Response(JSON.stringify({
        found: true, symbol: '2C26MLS', number: '9999',
        viewerUrl: 'https://027098005024.matbao.in/api/ViewInvTemplate.aspx?idinv=a&fkey=b&comid=c&pattern=2&convert=0'
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    pdfRequests++;
    throw Error('PDF must not be downloaded when invoice metadata mismatches');
  }) as typeof fetch;
  try {
    await assert.rejects(new MatbaoDriver().fetchPdf(
      new MatbaoDriver().extractInfo(rawXml), { recaptchaToken: 'captcha-token' }
    ),
      (error: unknown) => error instanceof OriginalInvoiceError &&
        error.code === 'MATBAO_PDF_LINK_UNVERIFIED');
    assert.equal(pdfRequests, 0);
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test('Matbao: CAPTCHA response points users to the provider upload portal', async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (request: RequestInfo | URL) => {
    const url = new URL(String(request));
    if (url.pathname.endsWith('/fkey')) {
      return new Response(JSON.stringify({ fkey: 'ABCDE12345' }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response('captcha required', { status: 403 });
  };
  try {
    await assert.rejects(new MatbaoDriver().fetchPdf(new MatbaoDriver().extractInfo(rawXml)),
      (error: unknown) => error instanceof OriginalInvoiceError &&
        error.code === 'MATBAO_CAPTCHA_REQUIRED' &&
        error.lookupUrl === 'https://matbao.in/tra-cuu-hoa-don');
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test('Matbao: fkey lookup downloads and verifies the returned original PDF', async () => {
  const oldFetch = globalThis.fetch;
  const expectedPdf = new jsPDF();
  expectedPdf.text('HOA DON MST 027098005024 C26MLS SO 3622', 10, 20);
  const pdfBytes = Buffer.from(expectedPdf.output('arraybuffer'));
  let calls = 0;
  globalThis.fetch = async (request: RequestInfo | URL) => {
    calls++;
    const url = new URL(String(request));
    if (url.pathname.endsWith('/fkey')) {
      return new Response(JSON.stringify({ fkey: 'ABCDE12345' }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      });
    }
    if (url.pathname === '/api/tra-cuu-hoa-don') {
      return new Response(JSON.stringify({
        found: true, symbol: '2C26MLS', number: '3622',
        viewerUrl: 'https://027098005024.matbao.in/api/ViewInvTemplate.aspx?' +
          'idinv=invoice-id&fkey=ABCDE12345&comid=company-id&pattern=2&convert=0'
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    assert.equal(url.pathname, '/api/tra-cuu-hoa-don/pdf');
    return new Response(pdfBytes, { status: 200, headers: { 'Content-Type': 'application/pdf' } });
  };
  try {
    const result = await new MatbaoDriver().fetchPdf(new MatbaoDriver().extractInfo(rawXml));
    assert.equal(calls, 3);
    assert.equal(result.isFallback, false);
    assert.equal(result.contentType, 'application/pdf');
    assert.equal(result.pdfBuffer?.subarray(0, 5).toString('latin1'), '%PDF-');
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test('Matbao: construct exact official PDF proxy from a verified viewer link', () => {
  const viewer = 'https://027098005024.matbao.in/api/ViewInvTemplate.aspx?' +
    'idinv=mfTTI1TEd1QVJLcnB2VWozSWFLQmIrZz09&fkey=YK5BAAFD48&' +
    'comid=NjFNU2ZzVWZwMUE9&pattern=2&convert=0';
  const proxy = matbaoPdfProxyFromViewer(viewer);
  assert.ok(proxy);
  const url = new URL(proxy);
  assert.equal(url.origin + url.pathname, 'https://matbao.in/api/tra-cuu-hoa-don/pdf');
  assert.equal(url.searchParams.get('src'), viewer);
  assert.equal(matbaoPdfProxyFromViewer('https://example.org/api/ViewInvTemplate.aspx?idinv=1&fkey=x&comid=y&pattern=2&convert=0'), undefined);
  assert.equal(matbaoPdfProxyFromViewer('https://matbao.in/api/ViewInvTemplate.aspx?idinv=1&fkey=x&comid=y&pattern=2&convert=0'), undefined);

  const response = {
    found: true, symbol: '2C26MLS', number: '3622',
    viewerUrl: viewer,
    pdfUrl: 'https://portal-group1.mifi.vn/downloadpdfca.aspx?keyinv=example',
  };
  const result = matbaoPdfUrlFromLookupResult(response, {
    invoiceNo: '0003622', invoiceSeries: 'C26MLS', templateCode: '2'
  });
  assert.equal(result, proxy);
  assert.equal(matbaoPdfUrlFromLookupResult({...response, number: '3623'}, {
    invoiceNo: '3622', invoiceSeries: 'C26MLS', templateCode: '2'
  }), undefined);
});
