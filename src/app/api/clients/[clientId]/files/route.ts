import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { ApiResponse } from '@/lib/types'
import { isDriveConfigured, getDriveClient } from '@/lib/drive'
import { getClientFolderId } from '@/lib/entity-helpers'

type RouteParams = {
  params: Promise<{ clientId: string }>
}

interface FileInfo {
  id: string
  name: string
  mimeType: string
  modifiedTime: string
  size?: string
}

// 企業フォルダ内のファイル一覧を取得
export async function GET(
  _request: NextRequest,
  context: RouteParams
): Promise<NextResponse<ApiResponse<FileInfo[]>>> {
  try {
    await requireAuth()
    const { clientId } = await context.params

    if (!clientId) {
      return NextResponse.json(
        { success: false, error: '無効なパラメータです' },
        { status: 400 }
      )
    }

    if (!isDriveConfigured()) {
      return NextResponse.json(
        { success: false, error: 'Google Driveが設定されていません' },
        { status: 500 }
      )
    }

    const clientFolderId = await getClientFolderId(clientId)
    if (!clientFolderId) {
      return NextResponse.json(
        { success: false, error: '企業が見つかりません' },
        { status: 404 }
      )
    }

    const drive = getDriveClient()
    const res = await drive.files.list({
      q: `'${clientFolderId}' in parents and trashed=false`,
      fields: 'files(id, name, mimeType, modifiedTime, size)',
      orderBy: 'name',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    })

    const files: FileInfo[] = (res.data.files || []).map(f => ({
      id: f.id || '',
      name: f.name || '',
      mimeType: f.mimeType || '',
      modifiedTime: f.modifiedTime || '',
      size: f.size || undefined,
    }))

    return NextResponse.json({ success: true, data: files })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      )
    }
    console.error('Get files error:', error)
    return NextResponse.json(
      { success: false, error: 'ファイル一覧の取得に失敗しました' },
      { status: 500 }
    )
  }
}
