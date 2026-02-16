'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, LogOut, BarChart3, FileText } from 'lucide-react'
import type { Client, Entity, SessionData, PdcaIssue } from '@/lib/types'
import { OverviewGrid } from '@/components/overview-grid'
import { OverviewPdcaSummary } from '@/components/overview-pdca-summary'

// デモ用KPIデータ（将来的にはAPIから取得）
const demoEntityKpis: { entityId: string; entityName: string; kpis: { name: string; actual: number; target: number; trend: 'up' | 'down' | 'flat' }[] }[] = []

type PageProps = {
  params: Promise<{ clientId: string }>
}

// イシューからサマリーを構築
interface PdcaSummary {
  entityId: string
  entityName: string
  issues: {
    id: string
    title: string
    latestStatus: PdcaIssue['status']
    latestDate: string
    latestTarget: string
  }[]
}

function buildSummaries(entities: Entity[], issues: PdcaIssue[]): PdcaSummary[] {
  return entities.map(entity => ({
    entityId: entity.id,
    entityName: entity.name,
    issues: issues
      .filter(i => i.entity_id === entity.id)
      .map(i => ({
        id: i.id,
        title: i.title,
        latestStatus: i.status,
        latestDate: i.updated_at,
        latestTarget: '', // 将来的にはサイクルから取得
      }))
  }))
}

export default function OverviewPage({ params }: PageProps) {
  const { clientId } = use(params)
  const router = useRouter()

  const [user, setUser] = useState<SessionData | null>(null)
  const [client, setClient] = useState<Client | null>(null)
  const [entities, setEntities] = useState<Entity[]>([])
  const [issues, setIssues] = useState<PdcaIssue[]>([])
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

        // 全イシュー取得
        const issuesRes = await fetch(`/api/clients/${clientId}/issues`)
        const issuesData = await issuesRes.json()
        if (issuesData.success) {
          setIssues(issuesData.data)
        }
      } catch (error) {
        console.error('Fetch error:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [router, clientId])

  // イシューからサマリーを構築
  const pdcaSummaries = buildSummaries(entities, issues)

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
            summaries={pdcaSummaries}
            onSelectEntity={handleSelectEntity}
          />
        )}
      </main>
    </div>
  )
}
