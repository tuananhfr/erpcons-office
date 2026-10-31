/** The legal entity behind the site; the footer and the Organization JSON-LD both read it, so their phone numbers never diverge. */
export const COMPANY = {
  brand: 'ERPCons',
  legalName: 'CÔNG TY CỔ PHẦN CÔNG NGHỆ ERPCONS',
  taxId: '0111149608',
  url: 'https://erpcons.ai/',
  address: { street: 'Số 226 đường Lê Trọng Tấn', ward: 'Phường Phương Liệt', city: 'Hà Nội', country: 'VN' },
  phone: { display: '0814 228 888', e164: '+84814228888' },
} as const
