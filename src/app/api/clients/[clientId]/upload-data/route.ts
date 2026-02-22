import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { loadJsonFromFolder, saveJsonToFolder, findFolderByName, getPdcaFolderId } from '@/lib/drive'

interface UnifiedData {
  source_file: string
  converted_at: string
  total_records: number
  total_columns: number
  columns: string[]
  data: Record<string, unknown>[]
}

// 値をクリーニング
function cleanValue(value: unknown): unknown {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') {
    if (isNaN(value)) return null
    if (Number.isInteger(value)) return value
    return Math.round(value * 10000) / 10000
  }
  if (value instanceof Date) {
    return value.toISOString().split('T')[0]
  }
  if (typeof value === 'string') {
    return value.trim() || null
  }
  return value
}

// ヘッダー行を特定
function findHeaderRows(data: unknown[][]): number[] {
  const headerRows: number[] = []

  for (let i = 0; i < Math.min(5, data.length); i++) {
    const row = data[i]
    if (!row) continue

    const nonNull = row.filter(v => v !== null && v !== undefined && v !== '')
    const strCount = nonNull.filter(v => typeof v === 'string').length
    const numCount = nonNull.filter(v => typeof v === 'number').length

    if (nonNull.length > 0 && strCount > numCount) {
      headerRows.push(i)
    } else if (headerRows.length > 0 && numCount > strCount) {
      break
    }
  }

  return headerRows.length > 0 ? headerRows : [0]
}

// 複数行ヘッダーを結合
function buildHeader(data: unknown[][], headerRows: number[]): (string | null)[] {
  const headers: (string | null)[] = []
  const colCount = Math.max(...data.slice(0, 10).map(r => r?.length || 0))

  for (let colIdx = 0; colIdx < colCount; colIdx++) {
    const parts: string[] = []
    for (const rowIdx of headerRows) {
      const val = data[rowIdx]?.[colIdx]
      if (val !== null && val !== undefined && val !== '') {
        const valStr = String(val).trim()
        if (valStr && !parts.includes(valStr)) {
          parts.push(valStr)
        }
      }
    }
    headers.push(parts.length > 0 ? parts.join('_') : null)
  }

  return headers
}

// シートを処理
function processSheet(data: unknown[][], sheetName: string): Record<string, unknown>[] {
  if (!data || data.length === 0) return []

  const headerRows = findHeaderRows(data)
  const columnNames = buildHeader(data, headerRows)
  const dataStart = Math.max(...headerRows) + 1
  const records: Record<string, unknown>[] = []

  for (let idx = dataStart; idx < data.length; idx++) {
    const row = data[idx]
    if (!row) continue

    // 全て空の行はスキップ
    if (row.every(v => v === null || v === undefined || v === '')) continue

    const record: Record<string, unknown> = {
      _sheet: sheetName,
      _row: idx + 1 // Excel行番号（1始まり）
    }

    for (let colIdx = 0; colIdx < columnNames.length; colIdx++) {
      const colName = columnNames[colIdx]
      if (colName && colIdx < row.length) {
        const val = cleanValue(row[colIdx])
        if (val !== null) {
          record[colName] = val
        }
      }
    }

    // シート名と行番号以外にデータがあれば追加
    if (Object.keys(record).length > 2) {
      records.push(record)
    }
  }

  return records
}

// Excel → JSON変換
function convertExcelToJson(buffer: Buffer, fileName: string): UnifiedData {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })

  const allRecords: Record<string, unknown>[] = []
  const allColumns = new Set<string>(['_sheet', '_row'])

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null })

    const records = processSheet(data, sheetName)
    allRecords.push(...records)

    for (const record of records) {
      Object.keys(record).forEach(key => allColumns.add(key))
    }
  }

  // カラムをソート（_sheet, _row を先頭に）
  const sortedColumns = ['_sheet', '_row', ...Array.from(allColumns).filter(c => !c.startsWith('_')).sort()]

  return {
    source_file: fileName,
    converted_at: new Date().toISOString(),
    total_records: allRecords.length,
    total_columns: sortedColumns.length,
    columns: sortedColumns,
    data: allRecords
  }
}

interface Client {
  id: string
  name: string
  drive_folder_id?: string
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const { clientId } = await params

    // FormDataからファイルを取得
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ success: false, error: 'ファイルが指定されていません' }, { status: 400 })
    }

    // ファイル形式チェック
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ]
    if (!allowedTypes.includes(file.type) && !file.name.match(/\.xlsx?$/i)) {
      return NextResponse.json({ success: false, error: 'Excelファイル(.xlsx, .xls)のみ対応しています' }, { status: 400 })
    }

    // ファイルサイズチェック（50MB上限）
    const maxSize = 50 * 1024 * 1024
    if (file.size > maxSize) {
      return NextResponse.json({ success: false, error: 'ファイルサイズは50MB以下にしてください' }, { status: 400 })
    }

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

    // クライアントフォルダを取得（なければ作成される）
    let clientFolderId: string | null | undefined = client.drive_folder_id
    if (!clientFolderId) {
      clientFolderId = await findFolderByName(client.name, pdcaFolderId)
      if (!clientFolderId) {
        return NextResponse.json({ success: false, error: 'クライアントフォルダが見つかりません' }, { status: 404 })
      }
    }

    // Excelファイルを読み込み
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // JSON変換
    const unifiedData = convertExcelToJson(buffer, file.name)

    // クライアント情報を追加
    const dataWithClient = {
      ...unifiedData,
      client_id: clientId,
      client_name: client.name,
    }

    // Driveに保存
    await saveJsonToFolder(dataWithClient, 'unified_data.json', clientFolderId as string)

    return NextResponse.json({
      success: true,
      data: {
        fileName: file.name,
        totalRecords: unifiedData.total_records,
        totalColumns: unifiedData.total_columns,
        sheets: [...new Set(unifiedData.data.map(r => r._sheet as string))],
        convertedAt: unifiedData.converted_at,
      }
    })

  } catch (error) {
    console.error('Upload error:', error)
    const message = error instanceof Error ? error.message : 'アップロードに失敗しました'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
