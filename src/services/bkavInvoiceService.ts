/** Download the provider PDF exposed by the public Bkav eHoadon lookup page. */
export async function downloadOriginalBkavPdf(params: {
  lookupCode?: string;
  xml?: string;
  recaptchaToken?: string;
  timeoutMs?: number;
}): Promise<{ data: Buffer; filename: string; contentType: string }> {
  const lookupCode = String(params.lookupCode || '').trim();
  const xml = String(params.xml || '').trim();
  const recaptchaToken = String(params.recaptchaToken || '').trim();
  if (!lookupCode && !xml) throw new Error('Cần mã tra cứu hoặc tệp XML hóa đơn Bkav eHoadon.');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs || 20000);
  try {
    const pageUrl = lookupCode
      ? `https://van.ehoadon.vn/TCHD?MTC=${encodeURIComponent(lookupCode)}`
      : 'https://van.ehoadon.vn/TCHD';
    const page = await fetch(pageUrl, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0 Safari/537.36'
      },
      signal: controller.signal
    });
    if (!page.ok) throw new Error(`Cổng Bkav trả về HTTP ${page.status}.`);
    let responseHtml = await page.text();

    if (xml && !lookupCode) {
      const hiddenFields = new Map<string, string>();
      for (const match of responseHtml.matchAll(/<input[^>]+name=["']([^"']+)["'][^>]*value=["']([^"']*)["'][^>]*>/gi)) {
        const name = match[1];
        if (/^(__VIEWSTATE|__VIEWSTATEGENERATOR|__EVENTVALIDATION|__EVENTTARGET|__EVENTARGUMENT|__LASTFOCUS|ctl00\$hdfShowBanner|ctl00\$bodySearch\$lookupBase\$hdfFileLastModifiedDate|ctl00\$bodySearch\$lookupBase\$hdfIsXML)$/i.test(name)) {
          hiddenFields.set(name, match[2].replace(/&amp;/g, '&').replace(/&quot;/g, '"'));
        }
      }

      const form = new FormData();
      hiddenFields.forEach((value, name) => form.set(name, value));
      form.set('ctl00$bodySearch$lookupBase$hdfIsXML', 'true');
      form.set('ctl00$bodySearch$lookupBase$fuXMLUpload', new Blob([xml], { type: 'text/xml' }), 'invoice.xml');
      form.set('ctl00$bodySearch$lookupBase$Button1', 'Tra cứu');
      if (recaptchaToken) {
        form.set('g-recaptcha-response', recaptchaToken);
        form.set('recaptchaToken', recaptchaToken);
      }

      const cookie = String(page.headers.get('set-cookie') || '').split(';')[0];
      const lookup = await fetch(pageUrl, {
        method: 'POST',
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0 Safari/537.36',
          ...(cookie ? { Cookie: cookie } : {})
        },
        body: form,
        signal: controller.signal
      });
      if (!lookup.ok) throw new Error(`Cổng Bkav trả về HTTP ${lookup.status} khi tải XML.`);
      responseHtml = await lookup.text();
    }

    const candidates = [...responseHtml.matchAll(/(?:href|src)=["']([^"']*Invoice_View[^"']+\.pdf[^"']*)["']/gi)]
      .map(match => match[1].replace(/&amp;/g, '&'));
    const relative = candidates[0];
    if (!relative) {
      if (/mã tra cứu.*không đúng|không tìm thấy|không tồn tại/i.test(responseHtml)) {
        throw new Error('Bkav không tìm thấy hóa đơn với mã tra cứu này.');
      }
      if (xml) {
        throw Object.assign(
          new Error('Bkav chưa trả về PDF gốc sau khi tiếp nhận XML. Cổng yêu cầu xác thực reCAPTCHA hợp lệ từ trang tra cứu.'),
          { code: 'RECAPTCHA_REQUIRED', status: 428, provider: 'BKAV', lookupUrl: 'https://van.ehoadon.vn/TCHD' }
        );
      }
      throw new Error('Bkav chưa trả về liên kết PDF gốc cho mã tra cứu này.');
    }

    const pdfUrl = new URL(relative, pageUrl).toString();
    const pdf = await fetch(pdfUrl, {
      headers: {
        Accept: 'application/pdf,application/octet-stream,*/*',
        Referer: pageUrl,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0 Safari/537.36'
      },
      signal: controller.signal
    });
    if (!pdf.ok) throw new Error(`Không tải được PDF Bkav: HTTP ${pdf.status}.`);
    const data = Buffer.from(await pdf.arrayBuffer());
    if (!data.subarray(0, 10).toString('latin1').includes('%PDF')) {
      throw new Error('Bkav không trả về tệp PDF hợp lệ.');
    }
    return {
      data,
      filename: `HoaDon_Bkav_${lookupCode || 'XML'}.pdf`,
      contentType: 'application/pdf'
    };
  } finally {
    clearTimeout(timer);
  }
}
