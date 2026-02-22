import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { loadJsonFromFolder, findFolderByName, getPdcaFolderId } from '@/lib/drive'

interface Client {
  id: string
  name: string
  drive_folder_id?: string
}

interface KpiData {
  entity_id: string
  entity_name: string
  data_type: string
  columns: string[]
  data: Record<string, unknown>[]
}

interface ColumnInfo {
  name: string
  label: string  // 表示名
  type: 'number' | 'string' | 'date' | 'unknown'
  unit: string   // 単位
  sampleValues: unknown[]
}

// カラム名から単位を推定
function inferUnit(colName: string): string {
  if (colName.includes('率') || colName === 'OCC' || colName.includes('OCC')) return '%'
  if (colName.includes('ADR') || colName.includes('RevPAR') || colName.includes('売上') || colName.includes('室料')) return '円'
  if (colName.includes('客数') || colName.includes('定員') || colName.includes('DOR')) return '人'
  if (colName.includes('部屋数') || colName.includes('客室数')) return '室'
  return ''
}

// カラムのデータ型を推定
function inferColumnType(values: unknown[]): 'number' | 'string' | 'date' | 'unknown' {
  const nonNullValues = values.filter(v => v !== null && v !== undefined && v !== '')
  if (nonNullValues.length === 0) return 'unknown'

  const numericCount = nonNullValues.filter(v => typeof v === 'number').length
  if (numericCount > nonNullValues.length * 0.5) return 'number'

  return 'string'
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string; entityId: string }> }
) {
  try {
    await requireAuth()
    const { clientId, entityId } = await params

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

    // 部署用KPIデータを探す（優先）
    const kpiFileName = `${entityId}_kpi_data.json`
    let kpiResult = await loadJsonFromFolder<KpiData>(kpiFileName, clientFolderId as string)

    // 見つからない場合はshukuhaku_chart_data.jsonを試す（部署IDがshukuhakuの場合など）
    if (!kpiResult) {
      kpiResult = await loadJsonFromFolder<KpiData>('shukuhaku_chart_data.json', clientFolderId as string)
    }

    if (!kpiResult) {
      return NextResponse.json({
        success: true,
        data: {
          columns: [],
          totalRecords: 0,
          message: 'KPIデータがありません。CSVをアップロードしてください。'
        }
      })
    }

    const { columns, data } = kpiResult.data

    // システムカラム（月順など）を除外
    const excludeColumns = ['月順']

    // 各カラムの情報を生成
    const columnInfos: ColumnInfo[] = columns
      .filter(colName => !excludeColumns.includes(colName))
      .map(colName => {
        const sampleValues = data
          .slice(0, 10)
          .map(row => row[colName])
          .filter(v => v !== null && v !== undefined)

        return {
          name: colName,
          label: colName,  // そのまま表示名として使用
          type: inferColumnType(data.map(row => row[colName])),
          unit: inferUnit(colName),
          sampleValues
        }
      })

    return NextResponse.json({
      success: true,
      data: {
        columns: columnInfos,
        totalRecords: data.length,
        totalColumns: columnInfos.length,
        entityName: kpiResult.data.entity_name || entityId
      }
    })

  } catch (error) {
    console.error('Entity Columns API error:', error)
    const message = error instanceof Error ? error.message : 'カラム取得に失敗しました'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
