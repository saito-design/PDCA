'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { Store, ChevronLeft, LogOut, LayoutDashboard, Eye } from 'lucide-react'
import type { Entity, Client, SessionData } from '@/lib/types'

type PageProps = {
  params: Promise<{ clientId: string }>
}

export default function EntitiesPage({ params }: PageProps) {
  const { clientId } = use(params)
  const router = useRouter()
  const [entities, setEntities] = useState<Entity[]>([])
  const [client, setClient] = useState<Client | null>(null)
  const [user, setUser] = useState<SessionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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

        // 企業情報取得（名前表示用）
        const clientsRes = await fetch('/api/clients')
        const clientsData = await clientsRes.json()
        if (clientsData.success) {
          const found = clientsData.data.find((c: Client) => c.id === clientId)
          setClient(found || null)
        }

        // 部署/店舗一覧取得
        const entitiesRes = await fetch(`/api/clients/${clientId}/entities`)
        const entitiesData = await entitiesRes.json()

        if (!entitiesData.success) {
          setError(entitiesData.error || '部署/店舗一覧の取得に失敗しました')
          return
        }
        setEntities(entitiesData.data)
      } catch {
        setError('データの取得に失敗しました')
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
    router.push('/clients')
  }

  const handleSelectEntity = (entityId: string) => {
    router.push(`/clients/${clientId}/entities/${entityId}/dashboard`)
  }

  const handleOverview = () => {
    router.push(`/clients/${clientId}/overview`)
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
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={handleBack}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
            >
              <ChevronLeft size={16} />
              戻る
            </button>
            <h1 className="text-xl font-bold">{client?.name || 'PDCA Dashboard'}</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">{user?.name}</span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
            >
              <LogOut size={16} />
              ログアウト
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">部署/店舗を選択</h2>
          <button
            onClick={handleOverview}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            <Eye size={16} />
            全体ビュー
          </button>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-4">
            {error}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {entities.map((entity) => (
            <button
              key={entity.id}
              onClick={() => handleSelectEntity(entity.id)}
              className="bg-white rounded-xl shadow p-6 text-left hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-3">
                <div className="bg-green-100 p-2 rounded-lg">
                  <Store className="text-green-600" size={24} />
                </div>
                <div>
                  <div className="font-semibold">{entity.name}</div>
                  <div className="text-sm text-gray-500 flex items-center gap-1">
                    <LayoutDashboard size={12} />
                    ダッシュボードを開く
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>

        {entities.length === 0 && !error && (
          <div className="text-center text-gray-500 py-12">
            表示できる部署/店舗がありません
          </div>
        )}
      </main>
    </div>
  )
}
