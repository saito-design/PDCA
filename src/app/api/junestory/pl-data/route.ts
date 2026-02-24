import { NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

export async function GET() {
  try {
    const dataPath = path.join(process.cwd(), 'data', 'junestory', 'pl_data.json')

    try {
      const fileContent = await fs.readFile(dataPath, 'utf-8')
      const data = JSON.parse(fileContent)

      return new NextResponse(JSON.stringify({
        success: true,
        data: data.data,
        meta: {
          company_name: data.company_name,
          generated_at: data.generated_at,
          total_records: data.total_records,
          stores: data.stores,
          yearmonths: data.yearmonths,
          categories: data.categories,
        }
      }), {
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      })
    } catch {
      return NextResponse.json({
        success: false,
        error: '会計データファイルが見つかりません。変換スクリプトを実行してください。',
        hint: 'python scripts/convert_junestory_pl.py'
      }, { status: 404 })
    }
  } catch (error) {
    console.error('PL data fetch error:', error)
    return NextResponse.json({
      success: false,
      error: 'データ取得に失敗しました'
    }, { status: 500 })
  }
}
