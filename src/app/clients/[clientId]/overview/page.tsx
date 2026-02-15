'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, LogOut, BarChart3, FileText } from 'lucide-react'
import type { Client, Entity, SessionData, PdcaStatus } from '@/lib/types'
import { OverviewGrid } from '@/components/overview-grid'
import { OverviewPdcaSummary } from '@/components/overview-pdca-summary'

// デモ用KPIデータ
const demoEntityKpis = [
  {
    entityId: 'demo-entity-1',
    entityName: '本店',
    kpis: [
      { name: 'RevPAR', actual: 10500, target: 12000, trend: 'up' as const },
      { name: 'OCC', actual: 78, target: 85, trend: 'up' as const },
      { name: 'ADR', actual: 13500, target: 14000, trend: 'flat' as const },
    ],
  },
  {
    entityId: 'demo-entity-2',
    entityName: '高田馬場店',
    kpis: [
      { name: 'RevPAR', actual: 9200, target: 10000, trend: 'down' as const },
      { name: 'OCC', actual: 72, target: 80, trend: 'flat' as const },
      { name: 'ADR', actual: 12800, target: 12500, trend: 'up' as const },
    ],
  },
  {
    entityId: 'demo-entity-3',
    entityName: '渋谷店',
    kpis: [
      { name: 'RevPAR', actual: 11000, target: 11000, trend: 'up' as const },
      { name: 'OCC', actual: 85, target: 85, trend: 'up' as const },
      { name: 'ADR', actual: 13000, target: 13000, trend: 'flat' as const },
    ],
  },
]

// デモ用PDCAサマリー
const demoPdcaSummaries = [
  {
    entityId: 'demo-entity-1',
    entityName: '本店',
    issues: [
      { id: 'issue-1', title: '朝食単価アップ施策', latestStatus: 'doing' as PdcaStatus, latestDate: '2025-02-01', latestTarget: '2月末までに単価1,500円達成' },
      { id: 'issue-2', title: '客室稼働率改善', latestStatus: 'open' as PdcaStatus, latestDate: '2025-01-20', latestTarget: '' },
    ],
  },
  {
    entityId: 'demo-entity-2',
    entityName: '高田馬場店',
    issues: [
      { id: 'issue-3', title: 'スタッフ教育プログラム', latestStatus: 'doing' as PdcaStatus, latestDate: '2025-02-01', latestTarget: '3月末までに全員研修完了' },
    ],
  },
  {
    entityId: 'demo-entity-3',
    entityName: '渋谷店',
    issues: [
      { id: 'issue-4', title: 'コスト削減施策', latestStatus: 'done' as PdcaStatus, latestDate: '2025-01-31', latestTarget: '光熱費10%削減' },
      { id: 'issue-5', title: '顧客満足度向上', latestStatus: 'paused' as PdcaStatus, latestDate: '2025-01-15', latestTarget: 'NPS+10ポイント' },
    ],
  },
]

type PageProps = {
  params: Promise<{ clientId: string }>
}

export default function OverviewPage({ params }: PageProps) {
  const { clientId } = use(params)
  const router = useRouter()

  const [user, setUser] = useState<SessionData | null>(null)
  const [client, setClient] = useState<Client | null>(null)
  const [entities, setEntities] = useState<Entity[]>([])
  const [activeTab, setActiveTab] = useState<'kpi' | 'pdca'>('kpi')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        // セッション確認
        const meRes = await fetch('/api/auth/me')
        const meData = await meRes.json()
        if (!meData.success || !meData.data?.isLoggedIn) {
          router.push('/')
          return
        }
        setUser(meData.data)

        // 企業情報
        const clientsRes = await fetch('/api/clients')
        const clientsData = await clientsRes.json()
        if (clientsData.success) {
          setClient(clientsData.data.find((c: Client) => c.id === clientId) || null)
        }

        // 部署/店舗一覧
        const entitiesRes = await fetch(`/api/clients/${clientId}/entities`)
        const entitiesData = await entitiesRes.json()
        if (entitiesData.success) {
          setEntities(entitiesData.data)
        }
      } catch (error) {
        console.error('Fetch error:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [router, clientId])

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/')
  }

  const handleBack = () => {
    router.push(`/clients/${clientId}`)
  }

  const handleSelectEntity = (entityId: string) => {
    router.push(`/clients/${clientId}/entities/${entityId}/dashboard`)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">読み込み中...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={handleBack}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
            >
              <ChevronLeft size={16} />
              戻る
            </button>
            <div>
              <h1 className="text-lg font-bold">{client?.name} - 全体ビュー</h1>
              <p className="text-sm text-gray-500">全部署/店舗の横断確認</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">{user?.name}</span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('kpi')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium ${
              activeTab === 'kpi'
                ? 'bg-blue-600 text-white'
                : 'bg-white border hover:bg-gray-50'
            }`}
          >
            <BarChart3 size={16} />
            KPI一覧
          </button>
          <button
            onClick={() => setActiveTab('pdca')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium ${
              activeTab === 'pdca'
                ? 'bg-blue-600 text-white'
                : 'bg-white border hover:bg-gray-50'
            }`}
          >
            <FileText size={16} />
            PDCAサマリー
          </button>
        </div>

        {/* Content */}
        {activeTab === 'kpi' ? (
          <OverviewGrid
            entities={entities}
            entityKpis={demoEntityKpis}
            onSelectEntity={handleSelectEntity}
          />
        ) : (
          <OverviewPdcaSummary
            entities={entities}
            summaries={demoPdcaSummaries}
            onSelectEntity={handleSelectEntity}
          />
        )}
      </main>
    </div>
  )
}
