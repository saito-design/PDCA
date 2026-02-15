'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { Store, ChevronLeft, LogOut, LayoutDashboard, Eye, Plus } from 'lucide-react'
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
  const [showAddModal, setShowAddModal] = useState(false)
  const [newEntityName, setNewEntityName] = useState('')
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    fetchData()
  }, [clientId])

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

  const handleAddEntity = async () => {
    if (!newEntityName.trim()) {
      alert('部署/店舗名を入力してください')
      return
    }
    setAdding(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/entities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newEntityName }),
      })
      const data = await res.json()
      if (data.success) {
        setShowAddModal(false)
        setNewEntityName('')
        fetchData()
      } else {
        alert(data.error || '追加に失敗しました')
      }
    } catch {
      alert('追加に失敗しました')
    } finally {
      setAdding(false)
    }
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
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
            >
              <Plus size={16} />
              追加
            </button>
            <button
              onClick={handleOverview}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
            >
              <Eye size={16} />
              全体ビュー
            </button>
          </div>
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

      {/* 追加モーダル */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">部署/店舗を追加</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                部署/店舗名
              </label>
              <input
                type="text"
                value={newEntityName}
                onChange={(e) => setNewEntityName(e.target.value)}
                placeholder="例: 新宿店"
                className="w-full border rounded-lg px-3 py-2"
              />
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                キャンセル
              </button>
              <button
                onClick={handleAddEntity}
                disabled={adding}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {adding ? '追加中...' : '追加'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
