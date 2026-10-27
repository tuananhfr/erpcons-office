// iOS Safari turns `accept` into UTIs and only maps MIME types reliably; a bare extension can grey files out.
// Types are the IANA/mime-db entries for each extension the editors' pickers and the landing ask for.
export const MIME_BY_EXTENSION: Readonly<Record<string, readonly string[]>> = {
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  docm: ['application/vnd.ms-word.document.macroenabled.12'],
  dotx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.template'],
  dotm: ['application/vnd.ms-word.template.macroenabled.12'],
  doc: ['application/msword'],
  dot: ['application/msword'],
  odt: ['application/vnd.oasis.opendocument.text'],
  rtf: ['application/rtf', 'text/rtf'],
  txt: ['text/plain'],
  md: ['text/markdown'],
  html: ['text/html'],
  htm: ['text/html'],
  xml: ['application/xml', 'text/xml'],
  json: ['application/json'],
  csv: ['text/csv'],
  tsv: ['text/tab-separated-values'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  xlsm: ['application/vnd.ms-excel.sheet.macroenabled.12'],
  xls: ['application/vnd.ms-excel'],
  xlsb: ['application/vnd.ms-excel.sheet.binary.macroenabled.12'],
  ods: ['application/vnd.oasis.opendocument.spreadsheet'],
  pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  pptm: ['application/vnd.ms-powerpoint.presentation.macroenabled.12'],
  potx: ['application/vnd.openxmlformats-officedocument.presentationml.template'],
  ppsx: ['application/vnd.openxmlformats-officedocument.presentationml.slideshow'],
  pdf: ['application/pdf'],
  png: ['image/png'],
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  gif: ['image/gif'],
  webp: ['image/webp'],
  bmp: ['image/bmp'],
  tif: ['image/tiff'],
  tiff: ['image/tiff'],
  jp2: ['image/jp2'],
  ttf: ['font/ttf'],
  otf: ['font/otf'],
  woff: ['font/woff'],
  woff2: ['font/woff2'],
  // RFC 8081 registers font/collection for both; mime-db maps .otc to an ODF chart template instead.
  ttc: ['font/collection'],
  otc: ['font/collection'],
  tex: ['application/x-tex'],
  text: ['text/plain'],
  wmf: ['image/wmf', 'application/x-msmetafile'],
  emf: ['image/emf', 'application/x-msmetafile'],
  jpx: ['image/jpx'],
  xfdf: ['application/vnd.adobe.xfdf'],
  fdf: ['application/fdf', 'application/vnd.fdf'],
  xdp: ['application/vnd.adobe.xdp+xml'],
  wav: ['audio/wav', 'audio/x-wav'],
  mp3: ['audio/mpeg'],
  m4a: ['audio/mp4', 'audio/x-m4a'],
  aac: ['audio/aac'],
  flac: ['audio/x-flac'],
  ogg: ['audio/ogg'],
  opus: ['audio/ogg'],
  aif: ['audio/x-aiff'],
  aiff: ['audio/x-aiff'],
  mp4: ['video/mp4'],
  m4v: ['video/x-m4v'],
  mov: ['video/quicktime'],
  webm: ['video/webm'],
  p12: ['application/x-pkcs12'],
  pfx: ['application/x-pkcs12'],
}

/** Appends the MIME types of every listed extension to an `accept` value, keeping the extensions for desktop browsers. */
export function withMimeTypes(accept: string): string {
  const tokens = accept.split(',').map((token) => token.trim()).filter(Boolean)
  const result = tokens.slice()
  const present = new Set(tokens.map((token) => token.toLowerCase()))
  for (const token of tokens) {
    if (!token.startsWith('.')) continue
    for (const mime of MIME_BY_EXTENSION[token.slice(1).toLowerCase()] ?? []) {
      if (!present.has(mime)) { present.add(mime); result.push(mime) }
    }
  }
  return result.join(',')
}
