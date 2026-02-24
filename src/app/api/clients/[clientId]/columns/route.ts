import { NextRequest, NextResponse } from 'next/server'
import { requireClientAccess } from '@/lib/auth'
import { loadJsonFromFolder, findFolderByName, getPdcaFolderId, getDriveClient, isDriveConfigured } from '@/lib/drive'

interface Client {
  id: string
  name: string
  drive_folder_id?: string
}

// master_data.json の構造（Pythonスクリプトで生成）
interface MasterData {
  company_name?: string
  generated_at?: string
  format?: string
  columns?: string[]
  total_records?: number
  departments?: string[]
  data: Record<string, unknown>[]
}

// *_master_data.json ファイルを検索
async function findMasterDataFile(folderId: string): Promise<string | null> {
  if (!isDriveConfigured()) return null

  try {
    const drive = getDriveClient()
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false and name contains '_master_data.json'`,
      fields: 'files(id, name)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    })
    const files = res.data.files || []
    if (files.length > 0) {
      return files[0].name || null
    }
    return null
  } catch {
    return null
  }
}

interface ColumnInfo {
  name: string
  type: 'number' | 'string' | 'date' | 'unknown'
  sampleValues: unknown[]
  isSystem: boolean  // _で始まるカラム
}

// カラムのデータ型を推定
function inferColumnType(values: unknown[]): 'number' | 'string' | 'date' | 'unknown' {
  const nonNullValues = values.filter(v => v !== null && v !== undefined && v !== '')
  if (nonNullValues.length === 0) return 'unknown'

  // 数値チェック
  const numericCount = nonNullValues.filter(v => typeof v === 'number').length
  if (numericCount > nonNullValues.length * 0.8) return 'number'

  // 日付チェック（ISO形式 or YYYY-MM-DD形式）
  const datePattern = /^\d{4}-\d{2}-\d{2}/
  const dateCount = nonNullValues.filter(v =>
    typeof v === 'string' && datePattern.test(v)
  ).length
  if (dateCount > nonNullValues.length * 0.8) return 'date'

  return 'string'
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const { clientId } = await params
    await requireClientAccess(clientId)

    // クライアント情報を取得
    const pdcaFolderId = getPdcaFolderId()
    const clientsResult = await loadJsonFromFolder<Client[]>('clients.json', pdcaFolderId)

    if (!clientsResult) {
      return NextResponse.json({ success: false, error: 'クライアント一覧が見つかりません' }, { status: 500 })
    }

    const client = clientsResult.data.find(c => c.id === clientId)
    if (!client) {
      return NextResponse.json({ success: false, error: 'クライアントが見つかりません' }, { status: 404 })
    }

    // クライアントフォルダを取得
    let clientFolderId: string | null | undefined = client.drive_folder_id
    if (!clientFolderId) {
      clientFolderId = await findFolderByName(client.name, pdcaFolderId)
      if (!clientFolderId) {
        return NextResponse.json({ success: false, error: 'クライアントフォルダが見つかりません' }, { status: 404 })
      }
    }

    // *_master_data.json を検索して読み込み
    const masterDataFileName = await findMasterDataFile(clientFolderId as string)
    if (!masterDataFileName) {
      return NextResponse.json({ success: false, error: 'master_data.jsonが見つかりません' }, { status: 404 })
    }

    const masterResult = await loadJsonFromFolder<MasterData>(masterDataFileName, clientFolderId as string)
    if (!masterResult) {
      return NextResponse.json({ success: false, error: 'master_data.jsonの読み込みに失敗しました' }, { status: 404 })
    }

    const { data } = masterResult.data
    // データから列名を抽出
    const columns = data.length > 0 ? Object.keys(data[0]) : []

    // 各カラムの情報を生成
    const columnInfos: ColumnInfo[] = columns.map(colName => {
      // サンプル値を取得（最大10件）
      const sampleValues = data
        .slice(0, 100)
        .map(row => row[colName])
        .filter(v => v !== null && v !== undefined && v !== '')
        .slice(0, 10)

      return {
        name: colName,
        type: inferColumnType(data.slice(0, 100).map(row => row[colName])),
        sampleValues,
        isSystem: colName.startsWith('_')
      }
    })

    return NextResponse.json({
      success: true,
      data: {
        columns: columnInfos,
        totalRecords: data.length,
        totalColumns: columns.length
      }
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
    console.error('Columns API error:', error)
    return NextResponse.json(
      { success: false, error: 'カラム取得に失敗しました' },
      { status: 500 }
    )
  }
}
