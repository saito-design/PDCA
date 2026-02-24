import { NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

export async function GET() {
  try {
    // 店舗マスタを読み込み
    const dataPath = path.join(process.cwd(), 'scripts', 'junestory_stores.json')

    try {
      const fileContent = await fs.readFile(dataPath, 'utf-8')
      const data = JSON.parse(fileContent)

      return new NextResponse(JSON.stringify({
        success: true,
        data: data.stores,
        meta: {
          company_name: data.company_name,
          total_stores: data.stores.length,
          pos_code_mapping: data.pos_code_mapping,
        }
      }), {
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      })
    } catch (fileError) {
      return NextResponse.json({
        success: false,
        error: '店舗マスタファイルが見つかりません'
      }, { status: 404 })
    }
  } catch (error) {
    console.error('Stores fetch error:', error)
    return NextResponse.json({
      success: false,
      error: 'データ取得に失敗しました'
    }, { status: 500 })
  }
}
