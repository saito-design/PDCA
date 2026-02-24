import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

interface DataRecord {
  年月: string
  店舗コード: string
  店舗名: string
  大項目: string
  中項目: string
  単位: string
  区分: string
  値: number
}

interface MonthlyData {
  yearMonth: string
  pos: {
    sales: number        // 純売上高
    customers: number    // 客数
    unitPrice: number    // 客単価
  }
  pl: {
    sales: number        // 売上高
    costOfSales: number  // 売上原価
    grossProfit: number  // 売上総利益
    sgAndA: number       // 販管費
    operatingProfit: number  // 営業利益
    ordinaryProfit: number   // 経常利益
  }
  // 計算指標
  metrics: {
    grossProfitRatio: number    // 粗利率
    operatingProfitRatio: number // 営業利益率
    laborCostRatio: number      // 人件費率
    rentRatio: number           // 賃借料率
  }
}

type RouteContext = {
  params: Promise<{ storeCode: string }>
}

async function loadJsonData(filename: string): Promise<DataRecord[]> {
  const dataPath = path.join(process.cwd(), 'data', 'junestory', filename)
  try {
    const content = await fs.readFile(dataPath, 'utf-8')
    const data = JSON.parse(content)
    return data.data || []
  } catch {
    return []
  }
}

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { storeCode } = await context.params

    // POS・PLデータ読み込み
    const [posData, plData] = await Promise.all([
      loadJsonData('pos_data.json'),
      loadJsonData('pl_data.json'),
    ])

    // 店舗でフィルタ
    const storePosData = posData.filter(r => r.店舗コード === storeCode)
    const storePlData = plData.filter(r => r.店舗コード === storeCode)

    if (storePosData.length === 0 && storePlData.length === 0) {
      return NextResponse.json({
        success: false,
        error: '店舗データが見つかりません'
      }, { status: 404 })
    }

    // 年月リストを取得
    const yearMonths = new Set<string>()
    storePosData.forEach(r => yearMonths.add(r.年月))
    storePlData.forEach(r => yearMonths.add(r.年月))

    // 月別に集計
    const monthlyData: MonthlyData[] = []

    for (const yearMonth of Array.from(yearMonths).sort()) {
      const posMonth = storePosData.filter(r => r.年月 === yearMonth)
      const plMonth = storePlData.filter(r => r.年月 === yearMonth)

      // POS集計
      const posSales = posMonth.find(r => r.中項目 === '純売上高(税抜)' || r.中項目 === '純売上高')?.値 || 0
      const posCustomers = posMonth.find(r => r.中項目 === '客数')?.値 || 0
      const posUnitPrice = posMonth.find(r => r.中項目 === '客単価(税抜)' || r.中項目 === '客単価')?.値 || 0

      // PL集計
      const plSales = plMonth.filter(r => r.大項目 === '売上高').reduce((sum, r) => sum + (r.値 || 0), 0)
      const plCostOfSales = plMonth.filter(r => r.大項目 === '売上原価').reduce((sum, r) => sum + (r.値 || 0), 0)
      const plSgAndA = plMonth.filter(r => r.大項目 === '販管費').reduce((sum, r) => sum + (r.値 || 0), 0)

      // 特定科目
      const laborCost = plMonth.filter(r =>
        r.中項目?.includes('給与') || r.中項目?.includes('賞与') || r.中項目?.includes('人件費')
      ).reduce((sum, r) => sum + (r.値 || 0), 0)

      const rentCost = plMonth.filter(r =>
        r.中項目?.includes('賃借料') || r.中項目?.includes('家賃')
      ).reduce((sum, r) => sum + (r.値 || 0), 0)

      // 利益計算
      const grossProfit = plSales - plCostOfSales
      const operatingProfit = grossProfit - plSgAndA

      // 経常利益を直接取得
      const ordinaryProfitRecord = plMonth.find(r =>
        r.中項目 === '経常利益' || r.中項目 === '配賦後経常利益'
      )
      const ordinaryProfit = ordinaryProfitRecord?.値 || operatingProfit

      // 比率計算
      const baseSales = plSales || posSales || 1

      monthlyData.push({
        yearMonth,
        pos: {
          sales: posSales,
          customers: posCustomers,
          unitPrice: posUnitPrice,
        },
        pl: {
          sales: plSales,
          costOfSales: plCostOfSales,
          grossProfit,
          sgAndA: plSgAndA,
          operatingProfit,
          ordinaryProfit,
        },
        metrics: {
          grossProfitRatio: baseSales > 0 ? Math.round((grossProfit / baseSales) * 1000) / 10 : 0,
          operatingProfitRatio: baseSales > 0 ? Math.round((operatingProfit / baseSales) * 1000) / 10 : 0,
          laborCostRatio: baseSales > 0 ? Math.round((laborCost / baseSales) * 1000) / 10 : 0,
          rentRatio: baseSales > 0 ? Math.round((rentCost / baseSales) * 1000) / 10 : 0,
        }
      })
    }

    // 店舗名取得
    const storeName = storePosData[0]?.店舗名 || storePlData[0]?.店舗名 || storeCode

    return NextResponse.json({
      success: true,
      data: {
        storeCode,
        storeName,
        monthlyData,
        // 生データも返す（詳細分析用）
        rawPos: storePosData,
        rawPl: storePlData,
      }
    })
  } catch (error) {
    console.error('Store data fetch error:', error)
    return NextResponse.json({
      success: false,
      error: 'データ取得に失敗しました'
    }, { status: 500 })
  }
}
