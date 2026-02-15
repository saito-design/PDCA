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
 * Lists files in a specific folder.
 */
export async function listFilesInFolder(
  folderId: string,
  q?: string,
  orderBy: string = 'modifiedTime desc'
) {
  const drive = getDrive()
  const query = `'${folderId}' in parents and trashed = false${q ? ` and ${q}` : ''}`
  const isSharedDrive = folderId.startsWith('0A')

  const res = await drive.files.list({
    q: query,
    fields: 'files(id, name, mimeType, webViewLink, createdTime, modifiedTime)',
    orderBy,
    pageSize: 100,
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
    ...(isSharedDrive && { driveId: folderId, corpora: 'drive' }),
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
