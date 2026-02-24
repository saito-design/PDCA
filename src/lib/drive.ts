import { google } from 'googleapis'
import { JWT } from 'google-auth-library'
import { Readable } from 'stream'

const SCOPES = ['https://www.googleapis.com/auth/drive']

function cleanEnvVar(val: string | undefined): string | undefined {
  if (!val) return undefined
  let clean = val.trim()
  if (clean.startsWith('"') && clean.endsWith('"')) {
    clean = clean.substring(1, clean.length - 1)
  }
  return clean.replace(/\\n/g, '\n')
}

function getPrivateKey(): string | undefined {
  // Base64エンコードされたキーを優先
  const base64Key = process.env.GOOGLE_PRIVATE_KEY_BASE64
  if (base64Key) {
    try {
      return Buffer.from(base64Key, 'base64').toString('utf-8')
    } catch {
      console.warn('Base64デコードに失敗')
    }
  }
  // 通常のキー
  return cleanEnvVar(process.env.GOOGLE_PRIVATE_KEY)
}

function getAuth() {
  const email = cleanEnvVar(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL)
  const key = getPrivateKey()

  if (!email || !key) {
    const hasBase64 = !!process.env.GOOGLE_PRIVATE_KEY_BASE64
    const hasNormal = !!process.env.GOOGLE_PRIVATE_KEY
    throw new Error(`Google Drive credentials are not configured. Email: ${!!email}, Key: ${!!key}, Base64: ${hasBase64}, Normal: ${hasNormal}`)
  }

  // 認証情報の検証（秘密情報はログに出力しない）
  if (!key.includes('-----BEGIN') || !key.includes('-----END')) {
    console.warn('Auth: Private key format may be invalid')
  }

  return new JWT({
    email,
    key,
    scopes: SCOPES,
  })
}

function getDrive() {
  return google.drive({ version: 'v3', auth: getAuth() })
}

/**
 * Check if folder ID is a shared drive root.
 */
function isSharedDriveRoot(folderId: string): boolean {
  return folderId.startsWith('0A')
}

/**
 * Lists files in a specific folder.
 */
export async function listFilesInFolder(
  folderId: string,
  q?: string,
  orderBy: string = 'modifiedTime desc'
) {
  const drive = getDrive()
  const isSharedRoot = isSharedDriveRoot(folderId)

  // 共有ドライブのルートの場合は、親フォルダの条件を変える
  let query: string
  if (isSharedRoot) {
    // 共有ドライブのルート直下のファイルを検索
    // parents条件なしで、driveIdとcorpora: driveで検索
    const parentCondition = `'${folderId}' in parents or parents = '${folderId}'`
    query = `(${parentCondition}) and trashed = false${q ? ` and ${q}` : ''}`
  } else {
    query = `'${folderId}' in parents and trashed = false${q ? ` and ${q}` : ''}`
  }

  try {
    const res = await drive.files.list({
      q: query,
      fields: 'files(id, name, mimeType, webViewLink, createdTime, modifiedTime)',
      orderBy,
      pageSize: 100,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      ...(isSharedRoot ? { driveId: folderId, corpora: 'drive' } : { corpora: 'allDrives' }),
    })
    return res.data.files || []
  } catch (error) {
    // 共有ドライブルートで404が出た場合は空配列を返す（まだファイルがない）
    if (error instanceof Error && 'code' in error && (error as { code: number }).code === 404) {
      console.warn('Folder not found, returning empty list:', folderId)
      return []
    }
    throw error
  }
}

/**
 * Finds a single file by exact name in a folder.
 */
export async function findFileByName(
  name: string,
  folderId: string,
  mimeType?: string
) {
  let q = `name = '${name}'`
  if (mimeType) {
    q += ` and mimeType = '${mimeType}'`
  }
  const files = await listFilesInFolder(folderId, q, 'modifiedTime desc')
  if (files.length === 0) return null
  return files[0]
}

/**
 * Finds a folder by name in a parent folder. Returns folder ID or null.
 */
export async function findFolderByName(
  folderName: string,
  parentId: string
): Promise<string | null> {
  const folder = await findFileByName(folderName, parentId, 'application/vnd.google-apps.folder')
  return folder?.id || null
}

/**
 * Uploads (creates or updates) a file.
 */
export async function saveFile(
  content: string | Buffer,
  filename: string,
  mimeType: string,
  folderId?: string,
  existingFileId?: string
) {
  const drive = getDrive()
  // UTF-8を明示的に指定
  const buffer = typeof content === 'string' ? Buffer.from(content, 'utf-8') : content
  const media = {
    mimeType: mimeType + '; charset=utf-8',
    body: Readable.from(buffer),
  }

  if (existingFileId) {
    console.log('saveFile: updating existing file', existingFileId)
    const res = await drive.files.update({
      fileId: existingFileId,
      media,
      fields: 'id, name, webViewLink',
      supportsAllDrives: true,
    })
    return res.data
  } else {
    if (!folderId) throw new Error('Folder ID is required for creating a new file')
    console.log('saveFile: creating new file', filename, 'in folder', folderId)
    try {
      const res = await drive.files.create({
        requestBody: {
          name: filename,
          parents: [folderId],
          mimeType,
        },
        media,
        fields: 'id, name, webViewLink',
        supportsAllDrives: true,
      })
      console.log('saveFile: created file', res.data.id)
      return res.data
    } catch (error) {
      console.error('saveFile: create failed for folder', folderId, error)
      throw error
    }
  }
}

/**
 * Uploads JSON file.
 */
export async function saveJsonFile(
  data: unknown,
  filename: string,
  folderId?: string,
  existingFileId?: string
) {
  return saveFile(
    JSON.stringify(data, null, 2),
    filename,
    'application/json',
    folderId,
    existingFileId
  )
}

/**
 * Creates a folder if it doesn't exist.
 */
export async function ensureFolder(
  folderName: string,
  parentId: string
): Promise<string> {
  console.log('ensureFolder: searching for', folderName, 'in', parentId)
  const existing = await findFileByName(folderName, parentId, 'application/vnd.google-apps.folder')
  if (existing) {
    console.log('ensureFolder: found existing folder', existing.id)
    return existing.id!
  }

  console.log('ensureFolder: creating new folder', folderName, 'in parent', parentId)
  const drive = getDrive()

  try {
    const createParams = {
      requestBody: {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId],
      },
      fields: 'id, name, parents',
      supportsAllDrives: true,
    }
    console.log('ensureFolder: create params', JSON.stringify(createParams))

    const res = await drive.files.create(createParams)
    console.log('ensureFolder: created folder', res.data.id, 'name:', res.data.name, 'parents:', res.data.parents)
    return res.data.id!
  } catch (error: unknown) {
    console.error('ensureFolder: create failed', error)
    // Google APIエラーの詳細を出力
    if (error && typeof error === 'object' && 'response' in error) {
      const gError = error as { response?: { data?: unknown } }
      console.error('ensureFolder: API error details', JSON.stringify(gError.response?.data))
    }
    throw error
  }
}

/**
 * Reads file content by file ID.
 */
export async function readFile(fileId: string): Promise<string> {
  const drive = getDrive()
  const res = await drive.files.get({
    fileId,
    alt: 'media',
    supportsAllDrives: true,
  }, { responseType: 'text' })
  return res.data as string
}

/**
 * Reads JSON file and parses it.
 */
export async function readJsonFile<T>(fileId: string): Promise<T> {
  const content = await readFile(fileId)
  return JSON.parse(content)
}

/**
 * Loads JSON file by name from a folder. Returns null if not found.
 */
export async function loadJsonFromFolder<T>(
  filename: string,
  folderId: string
): Promise<{ data: T; fileId: string } | null> {
  const file = await findFileByName(filename, folderId, 'application/json')
  if (!file || !file.id) return null
  const data = await readJsonFile<T>(file.id)
  return { data, fileId: file.id }
}

/**
 * Saves JSON file to a folder (creates or updates).
 */
export async function saveJsonToFolder<T>(
  data: T,
  filename: string,
  folderId: string
): Promise<string> {
  const existing = await findFileByName(filename, folderId, 'application/json')
  const result = await saveJsonFile(data, filename, folderId, existing?.id || undefined)
  return result.id!
}

/**
 * Check if Google Drive is configured.
 */
export function isDriveConfigured(): boolean {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const key = process.env.GOOGLE_PRIVATE_KEY || process.env.GOOGLE_PRIVATE_KEY_BASE64
  const folderId = process.env.GOOGLE_DRIVE_PDCA_FOLDER_ID
  return !!(email && key && folderId)
}

/**
 * Get PDCA root folder ID.
 */
export function getPdcaFolderId(): string {
  const folderId = process.env.GOOGLE_DRIVE_PDCA_FOLDER_ID
  if (!folderId) {
    throw new Error('GOOGLE_DRIVE_PDCA_FOLDER_ID is not configured')
  }
  return folderId
}

/**
 * Get Drive client for direct API access.
 */
export function getDriveClient() {
  return getDrive()
}

/**
 * Deletes a file or folder by ID.
 */
export async function deleteFile(fileId: string): Promise<void> {
  const drive = getDrive()
  await drive.files.delete({
    fileId,
    supportsAllDrives: true,
  })
  console.log('deleteFile: deleted', fileId)
}
