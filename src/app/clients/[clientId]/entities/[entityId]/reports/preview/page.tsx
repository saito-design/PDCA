'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { Printer, ArrowLeft } from 'lucide-react'
import type { Client, Entity, Task, PdcaCycle, PdcaStatus } from '@/lib/types'

type PageProps = {
  params: Promise<{ clientId: string; entityId: string }>
}

const STATUS_LABELS: Record<PdcaStatus, string> = {
  open: '未着手',
  doing: '進行中',
  done: '完了',
  paused: '保留',
}

export default function ReportPreviewPage({ params }: PageProps) {
  const { clientId, entityId } = use(params)
  const router = useRouter()

  const [client, setClient] = useState<Client | null>(null)
  const [entity, setEntity] = useState<Entity | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [latestCycle, setLatestCycle] = useState<PdcaCycle | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        // 認証確認
        const meRes = await fetch('/api/auth/me')
        const meData = await meRes.json()
        if (!meData.success || !meData.data?.isLoggedIn) {
          router.push('/')
          return
        }

        // 企業情報
        const clientsRes = await fetch('/api/clients')
        const clientsData = await clientsRes.json()
        if (clientsData.success) {
          setClient(clientsData.data.find((c: Client) => c.id === clientId) || null)
        }

        // 部署情報
        const entitiesRes = await fetch(`/api/clients/${clientId}/entities`)
        const entitiesData = await entitiesRes.json()
        if (entitiesData.success) {
          setEntity(entitiesData.data.find((e: Entity) => e.id === entityId) || null)
        }

        // タスク一覧
        const tasksRes = await fetch(`/api/clients/${clientId}/tasks`)
        const tasksData = await tasksRes.json()
        if (tasksData.success) {
          setTasks(tasksData.data)
        }

        // 最新サイクル
        const cyclesRes = await fetch(
          `/api/clients/${clientId}/entities/${entityId}/pdca/tasks/task-1/cycles`
        )
        const cyclesData = await cyclesRes.json()
        if (cyclesData.success && cyclesData.data.length > 0) {
          // 日付降順でソートして最新を取得
          const sorted = [...cyclesData.data].sort(
            (a: PdcaCycle, b: PdcaCycle) =>
              new Date(b.cycle_date).getTime() - new Date(a.cycle_date).getTime()
          )
          setLatestCycle(sorted[0])
        }
      } catch (error) {
        console.error('Fetch error:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [router, clientId, entityId])

  const handlePrint = () => {
    window.print()
  }

  const handleBack = () => {
    router.push(`/clients/${clientId}/entities/${entityId}/dashboard`)
  }

  // この部署のタスク（完了以外）
  const entityTasks = tasks.filter(
    t => t.entity_name === entity?.name && t.status !== 'done'
  )

  // 日付フォーマット
  const formatDate = (date: Date) => {
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-gray-500">読み込み中...</div>
      </div>
    )
  }

  return (
    <>
      {/* 印刷時に非表示のコントロール */}
      <div className="print:hidden bg-gray-100 p-4 flex items-center justify-between sticky top-0 z-10 border-b">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-800"
        >
          <ArrowLeft size={20} />
          戻る
        </button>
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          <Printer size={20} />
          印刷 / PDF保存
        </button>
      </div>

      {/* レポート本体 */}
      <div className="bg-gray-100 min-h-screen print:bg-white print:min-h-0">
        <div className="max-w-[210mm] mx-auto bg-white shadow-lg print:shadow-none">
          {/* A4用紙スタイル */}
          <div className="p-[20mm] min-h-[297mm] print:p-[15mm]" style={{ fontFamily: '"Noto Sans JP", "Hiragino Sans", sans-serif' }}>

            {/* ヘッダー */}
            <div className="mb-8">
              <div className="text-lg">
                {client?.name} 様
              </div>
              {entity && (
                <div className="text-lg">
                  {entity.name} 御中
                </div>
              )}
              <div className="text-right text-sm text-gray-600 mt-4">
                {formatDate(new Date())}
              </div>
            </div>

            {/* タイトル */}
            <div className="text-center mb-10">
              <h1 className="text-2xl font-bold border-b-2 border-t-2 border-gray-800 py-3 inline-block px-8">
                ミーティングメモ
              </h1>
            </div>

            {/* 進行中タスク */}
            {entityTasks.length > 0 && (
              <section className="mb-8">
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <span className="w-1 h-6 bg-blue-600 inline-block"></span>
                  進行中タスク
                  <span className="bg-blue-100 text-blue-700 text-sm font-normal px-2 py-0.5 rounded-full ml-2">
                    {entityTasks.length}件
                  </span>
                </h2>
                <div className="space-y-2">
                  {entityTasks.map(task => (
                    <div
                      key={task.id}
                      className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <span className={`w-3 h-3 rounded-full ${
                          task.status === 'doing' ? 'bg-blue-500' :
                          task.status === 'open' ? 'bg-gray-400' :
                          task.status === 'paused' ? 'bg-yellow-500' : 'bg-green-500'
                        }`}></span>
                        <span className="text-sm font-medium">{task.title}</span>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        task.status === 'doing' ? 'bg-blue-100 text-blue-700' :
                        task.status === 'open' ? 'bg-gray-100 text-gray-600' :
                        task.status === 'paused' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'
                      }`}>
                        {STATUS_LABELS[task.status]}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* 今回の議題 */}
            {latestCycle && (latestCycle.situation || latestCycle.issue || latestCycle.action || latestCycle.target) && (
              <section className="mb-8">
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <span className="w-1 h-6 bg-green-600 inline-block"></span>
                  ミーティング内容
                  <span className="text-sm font-normal text-gray-500 ml-2">
                    ({latestCycle.cycle_date})
                  </span>
                </h2>

                {/* 箇条書き形式 */}
                <ul className="space-y-2 text-sm text-gray-700 ml-4">
                  {latestCycle.situation && (
                    <li className="flex">
                      <span className="font-semibold text-blue-700 w-20 shrink-0">現状:</span>
                      <span className="whitespace-pre-wrap">{latestCycle.situation}</span>
                    </li>
                  )}
                  {latestCycle.issue && (
                    <li className="flex">
                      <span className="font-semibold text-orange-600 w-20 shrink-0">課題:</span>
                      <span className="whitespace-pre-wrap">{latestCycle.issue}</span>
                    </li>
                  )}
                  {latestCycle.action && (
                    <li className="flex">
                      <span className="font-semibold text-green-700 w-20 shrink-0">アクション:</span>
                      <span className="whitespace-pre-wrap">{latestCycle.action}</span>
                    </li>
                  )}
                  {latestCycle.target && (
                    <li className="flex">
                      <span className="font-semibold text-purple-700 w-20 shrink-0">目標:</span>
                      <span className="whitespace-pre-wrap">{latestCycle.target}</span>
                    </li>
                  )}
                </ul>
              </section>
            )}

            {/* データがない場合 */}
            {!latestCycle && entityTasks.length === 0 && (
              <div className="text-center text-gray-500 py-10">
                出力するデータがありません
              </div>
            )}

          </div>
        </div>
      </div>

      {/* 印刷用CSS */}
      <style jsx global>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 0;
          }
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>
    </>
  )
}
