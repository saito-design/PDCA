'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, LogOut, BarChart3, FileText } from 'lucide-react'
import type { Client, Entity, SessionData, PdcaIssue, Task } from '@/lib/types'
import { OverviewGrid } from '@/components/overview-grid'
import { OverviewPdcaSummary } from '@/components/overview-pdca-summary'

// デモ用KPIデータ（将来的にはAPIから取得）
const demoEntityKpis: { entityId: string; entityName: string; kpis: { name: string; actual: number; target: number; trend: 'up' | 'down' | 'flat' }[] }[] = []

type PageProps = {
  params: Promise<{ clientId: string }>
}

// サマリー用の型
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
  tasks: Task[]
}

function buildSummaries(entities: Entity[], issues: PdcaIssue[], tasks: Task[]): PdcaSummary[] {
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
        latestTarget: '',
      })),
    tasks: tasks // 全タスクを渡す
  }))
}

export default function OverviewPage({ params }: PageProps) {
  const { clientId } = use(params)
  const router = useRouter()

  const [user, setUser] = useState<SessionData | null>(null)
  const [client, setClient] = useState<Client | null>(null)
  const [entities, setEntities] = useState<Entity[]>([])
  const [issues, setIssues] = useState<PdcaIssue[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [activeTab, setActiveTab] = useState<'kpi' | 'pdca'>('pdca')
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

        // 部署/店舗一覧とマスターデータを並列取得
        const [entitiesRes, masterDataRes] = await Promise.all([
          fetch(`/api/clients/${clientId}/entities`),
          fetch(`/api/clients/${clientId}/master-data`),
        ])

        const [entitiesData, masterDataResult] = await Promise.all([
          entitiesRes.json(),
          masterDataRes.json(),
        ])

        if (entitiesData.success) {
          setEntities(entitiesData.data)
        }

        if (masterDataResult.success && masterDataResult.data) {
          const masterData = masterDataResult.data
          // issuesをPdcaIssue型に変換
          setIssues(masterData.issues || [])
          // issuesからTaskに変換（entity_name, dateを持つ）
          const tasksFromIssues: Task[] = (masterData.issues || []).map((issue: PdcaIssue & { entity_name?: string; date?: string }) => ({
            id: issue.id,
            client_id: issue.client_id,
            entity_name: issue.entity_name || '',
            title: issue.title,
            status: issue.status,
            date: issue.date || issue.created_at.split('T')[0],
            created_at: issue.created_at,
            updated_at: issue.updated_at,
          }))
          setTasks(tasksFromIssues)
        }
      } catch (error) {
        console.error('Fetch error:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [router, clientId])

  // サマリーを構築
  const pdcaSummaries = buildSummaries(entities, issues, tasks)

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
