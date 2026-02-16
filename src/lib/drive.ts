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

function getAuth() {
  const email = cleanEnvVar(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL)
  const key = cleanEnvVar(process.env.GOOGLE_PRIVATE_KEY)

  if (!email || !key) {
    throw new Error('Google Drive credentials are not configured')
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
  const query = `'${folderId}' in parents and trashed = false${q ? ` and ${q}` : ''}`

  const res = await drive.files.list({
    q: query,
    fields: 'files(id, name, mimeType, webViewLink, createdTime, modifiedTime)',
    orderBy,
    pageSize: 100,
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
    corpora: 'allDrives',
  })

  return res.data.files || []
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
 * Get shared drive ID from folder ID (if it's a shared drive).
 */
function getSharedDriveId(): string | undefined {
  const folderId = process.env.GOOGLE_DRIVE_PDCA_FOLDER_ID
  if (folderId && folderId.startsWith('0A')) {
    return folderId
  }
  return undefined
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
  const sharedDriveId = getSharedDriveId()
  const media = {
    mimeType,
    body: typeof content === 'string' ? Readable.from([content]) : Readable.from(content),
  }

  if (existingFileId) {
    const res = await drive.files.update({
      fileId: existingFileId,
      media,
      fields: 'id, name, webViewLink',
      supportsAllDrives: true,
    })
    return res.data
  } else {
    if (!folderId) throw new Error('Folder ID is required for creating a new file')
    const res = await drive.files.create({
      requestBody: {
        name: filename,
        parents: [folderId],
        mimeType,
        ...(sharedDriveId && { driveId: sharedDriveId }),
      },
      media,
      fields: 'id, name, webViewLink',
      supportsAllDrives: true,
    })
    return res.data
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
  const existing = await findFileByName(folderName, parentId)
  if (existing) return existing.id!

  const drive = getDrive()
  const sharedDriveId = getSharedDriveId()
  const res = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
    supportsAllDrives: true,
  })
  return res.data.id!
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
  const key = process.env.GOOGLE_PRIVATE_KEY
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
