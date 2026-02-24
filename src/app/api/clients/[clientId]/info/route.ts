import { NextRequest, NextResponse } from 'next/server'
import { requireClientAccess } from '@/lib/auth'
import { getClientDataInfo, refreshCache } from '@/lib/excel-reader'
import { loadJsonFromFolder, getPdcaFolderId, isDriveConfigured, getDriveClient } from '@/lib/drive'
import { ApiResponse, Client } from '@/lib/types'

type RouteParams = {
  params: Promise<{ clientId: string }>
}

// クライアント情報を取得するヘルパー
async function getClientById(clientId: string): Promise<Client | null> {
  try {
    const folderId = getPdcaFolderId()
    const result = await loadJsonFromFolder<Client[]>('clients.json', folderId)
    if (!result) return null
    return result.data.find(c => c.id === clientId) || null
  } catch {
    return null
  }
}

// Driveフォルダ内のデータファイルを検索（更新日時も取得）
interface DriveFileInfo {
  name: string | null
  modifiedTime: string | null
}

async function findDataFileInDrive(folderId: string): Promise<DriveFileInfo> {
  try {
    if (!isDriveConfigured()) return { name: null, modifiedTime: null }
    const drive = getDriveClient()
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false and name contains '_master_data.json'`,
      fields: 'files(id, name, modifiedTime)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    })
    const files = res.data.files || []
    if (files.length > 0) {
      return {
        name: files[0].name || null,
        modifiedTime: files[0].modifiedTime || null,
      }
    }
    return { name: null, modifiedTime: null }
  } catch {
    return { name: null, modifiedTime: null }
  }
}

export async function GET(
  _request: NextRequest,
  context: RouteParams
): Promise<NextResponse<ApiResponse>> {
  try {
    const { clientId } = await context.params
    await requireClientAccess(clientId)

    // クライアント情報を取得してdrive_folder_idを確認
    const client = await getClientById(clientId)
    const driveFolderId = client?.drive_folder_id ?? undefined

    // 基本情報を取得
    const info = getClientDataInfo(clientId, driveFolderId)

    // Driveフォルダがある場合、実際にファイルが存在するか確認（常に優先）
    let driveFileModifiedTime: string | null = null
    if (driveFolderId) {
      const fileInfo = await findDataFileInDrive(driveFolderId)
      if (fileInfo.name) {
        info.fileName = fileInfo.name
        info.hasDataSource = true
        info.dataSourceType = 'drive'
        info.driveFolderId = driveFolderId
        info.filePath = null
        info.folderPath = null
        driveFileModifiedTime = fileInfo.modifiedTime
      } else {
        // Driveにファイルがない場合
        info.fileName = null
        info.hasDataSource = false
        info.dataSourceType = null
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        ...info,
        driveFileModifiedTime,
      },
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      )
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json(
        { success: false, error: 'アクセス権限がありません' },
        { status: 403 }
      )
    }
    console.error('Get client info error:', error)
    return NextResponse.json(
      { success: false, error: '情報の取得に失敗しました' },
      { status: 500 }
    )
  }
}

// データ更新
export async function POST(
  _request: NextRequest,
  context: RouteParams
): Promise<NextResponse<ApiResponse>> {
  try {
    const { clientId } = await context.params
    await requireClientAccess(clientId)

    const result = refreshCache(clientId)

    if (!result.success) {
      return NextResponse.json({
        success: false,
        error: result.error,
      })
    }

    return NextResponse.json({
      success: true,
      data: {
        updatedAt: result.updatedAt,
      },
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      )
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json(
        { success: false, error: 'アクセス権限がありません' },
        { status: 403 }
      )
    }
    console.error('Refresh cache error:', error)
    return NextResponse.json(
      { success: false, error: 'データの更新に失敗しました' },
      { status: 500 }
    )
  }
}
