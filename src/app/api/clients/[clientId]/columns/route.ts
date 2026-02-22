import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { loadJsonFromFolder, findFolderByName, getPdcaFolderId } from '@/lib/drive'

interface Client {
  id: string
  name: string
  drive_folder_id?: string
}

interface UnifiedData {
  columns: string[]
  data: Record<string, unknown>[]
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
    await requireAuth()
    const { clientId } = await params

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

    // unified_data.jsonを読み込み
    const unifiedResult = await loadJsonFromFolder<UnifiedData>('unified_data.json', clientFolderId as string)
    if (!unifiedResult) {
      return NextResponse.json({ success: false, error: 'unified_data.jsonが見つかりません' }, { status: 404 })
    }

    const { columns, data } = unifiedResult.data

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
    console.error('Columns API error:', error)
    const message = error instanceof Error ? error.message : 'カラム取得に失敗しました'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
