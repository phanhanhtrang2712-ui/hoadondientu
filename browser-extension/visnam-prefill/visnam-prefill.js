(() => {
  'use strict';
  // Only prefill the issuer's actual lookup form, never its XML verification
  // form or CAPTCHA. The extension does not submit the form or fetch invoices.
  const host = location.hostname.toLowerCase();
  const isSaigonCoop = host === 'saigoncoop.einvoice.com.vn';
  const isVisnam = host === 'tracuu.vin-hoadon.com' &&
    location.pathname.replace(/\/+$/, '').toLowerCase() ===
      '/tracuuhoadon/tracuuxacthuc/tracuuhd';
  if (!isSaigonCoop && !isVisnam) return;

  const params = new URLSearchParams(location.hash.replace(/^#/, ''));
  const code = String(params.get(isSaigonCoop ? 'hms_thaison_code' : 'hms_visnam_code') || '').trim();
  if (!/^[A-Za-z0-9._-]{5,128}$/.test(code)) return;

  const normalize = s => String(s || '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd')
    .toLowerCase().replace(/\s+/g, ' ').trim();
  const visible = el => el instanceof HTMLInputElement &&
    !['hidden','password','file','checkbox','radio','submit','button'].includes(el.type) &&
    el.getClientRects().length > 0 && !el.disabled;
  const isCaptcha = s => /captcha|xac thuc|xac nhan|kiem tra|security image|verify|verification|ma hinh/.test(s);
  const isLookup = s => /ma so bi mat|ma tra cuu|ma bao mat|so bao mat|ma bi mat|ma so bao mat|lookup|sobaomat|mabimat|mabaomat|mahoadon|mhd/.test(s);
  const description = el => normalize([
    el.name, el.id, el.placeholder, el.getAttribute('aria-label') || '',
    ...[...document.querySelectorAll('label')].filter(l => l.htmlFor && l.htmlFor === el.id).map(l => l.textContent || ''),
    el.closest('label')?.textContent || ''
  ].join(' '));

  const choose = () => {
    const inputs = [...document.querySelectorAll('input')].filter(visible);
    if (isSaigonCoop) {
      const lookupInputs = inputs.filter(el =>
        el.name.toUpperCase() === 'MA_NHAN_HOA_DON' || el.id.toUpperCase() === 'MA_NHAN_HOA_DON'
      );
      return lookupInputs.length === 1 ? lookupInputs[0] : null;
    }

    // The observed VIN-HOADON page has a text input with placeholder
    // "Mã số bí mật" and a separate "Nhập mã xác thực" CAPTCHA field.
    // Prefer a unique exact placeholder match; never inspect a shared
    // parent row that also contains the CAPTCHA caption.
    const exact = inputs.filter(el => /^(ma so bi mat|ma tra cuu|ma bao mat|so bao mat)$/.test(
      normalize(el.placeholder || el.getAttribute('aria-label') || '')
    ));
    if (exact.length === 1) return exact[0];
    const candidates = inputs.filter(el => {
      const label = description(el);
      return isLookup(label) && !isCaptcha(label);
    });
    return candidates.length === 1 ? candidates[0] : null;
  };
  let done = false;
  const apply = () => {
    if (done) return true;
    const input = choose();
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (setter) setter.call(input, code);
    else input.value = code;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    if (input.value !== code) return false;
    done = true;
    history.replaceState(history.state, '', location.pathname + location.search);
    return true;
  };
  if (apply()) return;
  let tries = 0;
  const timer = setInterval(() => {
    if (apply() || ++tries >= 80) clearInterval(timer);
  }, 250);
})();
