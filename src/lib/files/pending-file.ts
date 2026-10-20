import { editorPath, type EditorSlug } from '../../config/editors.ts'

export const MAX_FILE_SIZE = 100 * 1024 * 1024
export const FILE_DB = 'erpcons-file-transfer-v1'
export const FILE_STORE = 'pending'
const EXTENSIONS: Record<string, EditorSlug> = { docx: 'van-ban', xlsx: 'bang-tinh', pptx: 'trinh-chieu', pdf: 'pdf' }

export function editorForFile(name: string): EditorSlug | undefined {
  return EXTENSIONS[name.split('.').pop()?.toLowerCase() ?? '']
}

export function validateFile(file: Pick<File, 'name' | 'size'>): EditorSlug {
  const editor = editorForFile(file.name)
  if (!editor) throw new Error('Vui lòng chọn tệp DOCX, XLSX, PPTX hoặc PDF.')
  if (!file.size) throw new Error('Tệp đang trống. Vui lòng chọn tệp khác.')
  if (file.size > MAX_FILE_SIZE) throw new Error('Tệp vượt quá 100 MB. Hãy mở trực tiếp từ menu Tệp của công cụ.')
  return editor
}

export async function prepareFile(file: File): Promise<string> {
  const editor = validateFile(file)
  const id = crypto.randomUUID()
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(FILE_DB, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(FILE_STORE, { keyPath: 'id' })
    request.onerror = () => reject(new Error('Không lưu tạm được tệp trên thiết bị. Kiểm tra quyền lưu trữ của trình duyệt.'))
    request.onsuccess = () => {
      const db = request.result
      const transaction = db.transaction(FILE_STORE, 'readwrite')
      const store = transaction.objectStore(FILE_STORE)
      const cursor = store.openCursor()
      cursor.onsuccess = () => {
        const entry = cursor.result
        if (entry) {
          if (entry.value.expiresAt < Date.now()) entry.delete()
          entry.continue()
        }
      }
      store.put({ id, name: file.name, file, editor, expiresAt: Date.now() + 60 * 60 * 1000 })
      transaction.oncomplete = () => { db.close(); resolve() }
      transaction.onabort = () => { db.close(); reject(new Error('Không đủ bộ nhớ để chuẩn bị tệp. Bạn có thể mở trực tiếp trong công cụ.')) }
    }
  })
  return `${editorPath(editor)}?open=${encodeURIComponent(id)}`
}
