'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, LogOut } from 'lucide-react'
import type { Client, SessionData } from '@/lib/types'

export default function ClientsPage() {
  const router = useRouter()
  const [clients, setClients] = useState<Client[]>([])
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

        // 企業一覧取得
        const clientsRes = await fetch('/api/clients')
        const clientsData = await clientsRes.json()

        if (!clientsData.success) {
          setError(clientsData.error || '企業一覧の取得に失敗しました')
          return
        }
        setClients(clientsData.data)
      } catch {
        setError('データの取得に失敗しました')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [router])

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/')
  }

  const handleSelectClient = (clientId: string) => {
    router.push(`/clients/${clientId}`)
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
          <h1 className="text-xl font-bold">PDCA Dashboard</h1>
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
        <h2 className="text-lg font-semibold mb-4">企業を選択</h2>

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-4">
            {error}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((client) => (
            <button
              key={client.id}
              onClick={() => handleSelectClient(client.id)}
              className="bg-white rounded-xl shadow p-6 text-left hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-3">
                <div className="bg-blue-100 p-2 rounded-lg">
                  <Building2 className="text-blue-600" size={24} />
                </div>
                <div>
                  <div className="font-semibold">{client.name}</div>
                  <div className="text-sm text-gray-500">選択して開始</div>
                </div>
              </div>
            </button>
          ))}
        </div>

        {clients.length === 0 && !error && (
          <div className="text-center text-gray-500 py-12">
            表示できる企業がありません
          </div>
        )}
      </main>
    </div>
  )
}
