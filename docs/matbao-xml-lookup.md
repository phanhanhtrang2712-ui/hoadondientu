# Matbao / Mifi original PDF lookup (MSTTCGP 0302712571)

The public Matbao portal reads the uploaded XML in the browser; it does not
send the XML file to a separate upload endpoint. For XML without an `<Fkey>`,
the portal requests:

`GET /api/tra-cuu-hoa-don/fkey?taxcode=...&pattern=...&serial=...&no=...`

The response contains an `fkey`. The portal then requests
`GET /api/tra-cuu-hoa-don?code=<fkey>&keyword=&token=<reCAPTCHA token>` and
receives the matched invoice's `viewerUrl`, `pdfUrl`, and related links. The
driver mirrors these steps from the invoice XML, validates the returned
invoice number and series, restricts PDF targets to Matbao/Mifi hosts, then
validates the PDF's seller tax code, series, and invoice number.

The lookup endpoint may require a valid reCAPTCHA token. The app does not
manufacture or bypass that token; if the provider rejects the lookup or
returns no result without CAPTCHA, the app directs the user to the official
portal to complete the verification and upload the XML.

The XML does not use MCCQT or another tax-authority value as an FKey.

## Testing

`node --import tsx --test tests/matbao-driver.test.ts`

Never commit customer XML, credentials, cookie headers, or invoice files to
repository fixtures.
