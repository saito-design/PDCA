'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, LogOut, RefreshCw, FileSpreadsheet, FolderOpen, Plus, Copy, Check, Trash2, AlertTriangle, Cloud } from 'lucide-react'
import type { Client, SessionData } from '@/lib/types'

interface ClientDataInfo {
  hasDataSource: boolean
  dataSourceType: 'excel' | 'drive' | null
  fileName: string | null
  filePath: string | null
  folderPath: string | null
  driveFolderId: string | null
  cacheUpdatedAt: string | null
  hasCache: boolean
}

interface ClientWithInfo extends Client {
  dataInfo?: ClientDataInfo
}

export default function ClientsPage() {
  const router = useRouter()
  const [clients, setClients] = useState<ClientWithInfo[]>([])
  const [user, setUser] = useState<SessionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshingId, setRefreshingId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [newClientName, setNewClientName] = useState('')
  const [adding, setAdding] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{
    client: Client
    stats: { entityCount: number; issueCount: number; cycleCount: number; chartCount: number }
  } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [loadingStats, setLoadingStats] = useState(false)

  useEffect(() => {
    fetchData()
  }, [])

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

      // 各企業のデータ情報を取得
      const clientsWithInfo: ClientWithInfo[] = await Promise.all(
        clientsData.data.map(async (client: Client) => {
          try {
            const infoRes = await fetch(`/api/clients/${client.id}/info`)
            const infoData = await infoRes.json()
            return {
              ...client,
              dataInfo: infoData.success ? infoData.data : undefined,
            }
          } catch {
            return client
          }
        })
      )

      setClients(clientsWithInfo)
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

  const handleSelectClient = (clientId: string) => {
    router.push(`/clients/${clientId}`)
  }

  const handleRefresh = async (clientId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setRefreshingId(clientId)
    try {
      const res = await fetch(`/api/clients/${clientId}/info`, { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        // 更新日時を反映
        setClients((prev) =>
          prev.map((c) =>
            c.id === clientId
              ? { ...c, dataInfo: { ...c.dataInfo!, cacheUpdatedAt: data.data.updatedAt, hasCache: true } }
              : c
          )
        )
      } else {
        alert(data.error || 'データの更新に失敗しました')
      }
    } catch {
      alert('データの更新に失敗しました')
    } finally {
      setRefreshingId(null)
    }
  }

  const handleCopyPath = async (path: string, clientId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(path)
      setCopiedId(clientId)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      alert('コピーに失敗しました')
    }
  }

  const handleAddClient = async () => {
    if (!newClientName.trim()) {
      alert('企業名を入力してください')
      return
    }
    setAdding(true)
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newClientName }),
      })
      const data = await res.json()
      if (data.success) {
        setShowAddModal(false)
        setNewClientName('')
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

  const handleDeleteClick = async (client: Client, e: React.MouseEvent) => {
    e.stopPropagation()
    setLoadingStats(true)
    try {
      const res = await fetch(`/api/clients/${client.id}`)
      const data = await res.json()
      if (data.success) {
        setDeleteTarget({
          client: data.data.client,
          stats: data.data.stats,
        })
      } else {
        alert(data.error || '企業情報の取得に失敗しました')
      }
    } catch {
      alert('企業情報の取得に失敗しました')
    } finally {
      setLoadingStats(false)
    }
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/clients/${deleteTarget.client.id}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (data.success) {
        setDeleteTarget(null)
        fetchData()
      } else {
        alert(data.error || '削除に失敗しました')
      }
    } catch {
      alert('削除に失敗しました')
    } finally {
      setDeleting(false)
    }
  }

  const isMasterClient = (clientId: string) => {
    return ['junestory', 'tottori-kyosai'].includes(clientId)
  }

  const formatDate = (isoString: string | null) => {
    if (!isoString) return '未取得'
    const date = new Date(isoString)
    return date.toLocaleString('ja-JP', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
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
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
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
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">企業を選択</h2>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            <Plus size={16} />
            企業を追加
          </button>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-4">
            {error}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {clients.map((client) => (
            <div
              key={client.id}
              onClick={() => handleSelectClient(client.id)}
              className="bg-white rounded-xl shadow p-5 cursor-pointer hover:shadow-md transition-shadow"
            >
              {/* ヘッダー部分 */}
              <div className="flex items-start gap-3 mb-4">
                <div className="bg-blue-100 p-2 rounded-lg">
                  <Building2 className="text-blue-600" size={24} />
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-lg">{client.name}</div>
                  <div className="text-xs text-gray-400">ID: {client.id}</div>
                </div>
                {!isMasterClient(client.id) && (
                  <button
                    onClick={(e) => handleDeleteClick(client, e)}
                    disabled={loadingStats}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                    title="削除"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>

              {/* データソース情報 */}
              {client.dataInfo?.hasDataSource && (
                <div className="border-t pt-3 space-y-2">
                  {/* ファイル名 */}
                  <div className="flex items-center gap-2 text-sm">
                    {client.dataInfo.dataSourceType === 'drive' ? (
                      <Cloud size={14} className="text-blue-600" />
                    ) : (
                      <FileSpreadsheet size={14} className="text-green-600" />
                    )}
                    <span className="text-gray-600 truncate flex-1">
                      {client.dataInfo.fileName}
                    </span>
                    {client.dataInfo.dataSourceType === 'drive' && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                        Drive
                      </span>
                    )}
                  </div>

                  {/* 更新日時と更新ボタン（Excelの場合のみ） */}
                  {client.dataInfo.dataSourceType === 'excel' && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">
                        更新: {formatDate(client.dataInfo.cacheUpdatedAt)}
                      </span>
                      <button
                        onClick={(e) => handleRefresh(client.id, e)}
                        disabled={refreshingId === client.id}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50"
                      >
                        <RefreshCw
                          size={12}
                          className={refreshingId === client.id ? 'animate-spin' : ''}
                        />
                        {refreshingId === client.id ? '更新中...' : 'データ更新'}
                      </button>
                    </div>
                  )}

                  {/* フォルダパス（Excelの場合） */}
                  {client.dataInfo.folderPath && (
                    <div className="flex items-center gap-2">
                      <FolderOpen size={14} className="text-amber-600" />
                      <span className="text-xs text-gray-500 truncate flex-1">
                        {client.dataInfo.folderPath}
                      </span>
                      <button
                        onClick={(e) => handleCopyPath(client.dataInfo!.folderPath!, client.id, e)}
                        className="text-gray-400 hover:text-gray-600"
                        title="パスをコピー"
                      >
                        {copiedId === client.id ? (
                          <Check size={14} className="text-green-600" />
                        ) : (
                          <Copy size={14} />
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* データソースなしの場合 */}
              {!client.dataInfo?.hasDataSource && (
                <div className="border-t pt-3">
                  <div className="text-xs text-gray-400">
                    データソース未設定
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {clients.length === 0 && !error && (
          <div className="text-center text-gray-500 py-12">
            表示できる企業がありません
          </div>
        )}
      </main>

      {/* 削除確認モーダル */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-red-100 p-2 rounded-full">
                <AlertTriangle className="text-red-600" size={24} />
              </div>
              <h3 className="text-lg font-semibold">企業を削除</h3>
            </div>

            <p className="text-gray-600 mb-4">
              <span className="font-semibold">{deleteTarget.client.name}</span> を削除しますか？
            </p>

            {/* 関連データの表示 */}
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <p className="text-sm font-medium text-gray-700 mb-2">削除される関連データ:</p>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>・部署/店舗: {deleteTarget.stats.entityCount} 件</li>
                <li>・PDCAタスク: {deleteTarget.stats.issueCount} 件</li>
                <li>・PDCAサイクル: {deleteTarget.stats.cycleCount} 件</li>
                <li>・グラフ: {deleteTarget.stats.chartCount} 件</li>
              </ul>
            </div>

            <p className="text-sm text-red-600 mb-4">
              この操作は取り消せません。本当に削除しますか？
            </p>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                キャンセル
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? '削除中...' : '削除する'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 追加モーダル */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">企業を追加</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                企業名
              </label>
              <input
                type="text"
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                placeholder="例: 株式会社ABC"
                className="w-full border rounded-lg px-3 py-2"
              />
              <p className="text-xs text-gray-500 mt-1">IDは自動で付与されます</p>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                キャンセル
              </button>
              <button
                onClick={handleAddClient}
                disabled={adding}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
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
