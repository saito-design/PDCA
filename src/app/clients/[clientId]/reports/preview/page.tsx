'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { Printer, ArrowLeft } from 'lucide-react'
import type { Client, Entity, Task, PdcaStatus, PdcaCycle } from '@/lib/types'

type PageProps = {
  params: Promise<{ clientId: string }>
}

const STATUS_LABELS: Record<PdcaStatus, string> = {
  open: '未着手',
  doing: '進行中',
  done: '完了',
  paused: '保留',
}

export default function CompanyReportPreviewPage({ params }: PageProps) {
  const { clientId } = use(params)
  const router = useRouter()

  const [client, setClient] = useState<Client | null>(null)
  const [entities, setEntities] = useState<Entity[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [cyclesByEntity, setCyclesByEntity] = useState<Record<string, PdcaCycle | null>>({})
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

        // 部署一覧
        const entitiesRes = await fetch(`/api/clients/${clientId}/entities`)
        const entitiesData = await entitiesRes.json()
        if (entitiesData.success) {
          setEntities(entitiesData.data)
        }

        // 各部署のタスクとサイクルを取得
        if (entitiesData.success && entitiesData.data.length > 0) {
          const allTasks: Task[] = []
          const cyclesMap: Record<string, PdcaCycle | null> = {}

          for (const entity of entitiesData.data) {
            try {
              // 部署別タスクを取得
              const tasksRes = await fetch(
                `/api/clients/${clientId}/entities/${entity.id}/tasks`
              )
              const tasksData = await tasksRes.json()
              if (tasksData.success) {
                allTasks.push(...tasksData.data)
              }

              // 部署別サイクルを取得
              const cyclesRes = await fetch(
                `/api/clients/${clientId}/entities/${entity.id}/cycles`
              )
              const cyclesData = await cyclesRes.json()
              if (cyclesData.success && cyclesData.data.length > 0) {
                // 最新のサイクルを取得（同日に複数ある場合はcreated_atで判断）
                const sorted = [...cyclesData.data].sort(
                  (a: PdcaCycle, b: PdcaCycle) => {
                    // まず日付で比較
                    const dateDiff = new Date(b.cycle_date).getTime() - new Date(a.cycle_date).getTime()
                    if (dateDiff !== 0) return dateDiff
                    // 同日の場合はcreated_atで比較
                    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                  }
                )
                cyclesMap[entity.id] = sorted[0]
              } else {
                cyclesMap[entity.id] = null
              }
            } catch {
              cyclesMap[entity.id] = null
            }
          }
          setTasks(allTasks)
          setCyclesByEntity(cyclesMap)
        }
      } catch (error) {
        console.error('Fetch error:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [router, clientId])

  const handlePrint = () => {
    window.print()
  }

  const handleBack = () => {
    router.push(`/clients/${clientId}`)
  }

  // 完了以外のタスクを部署ごとにグループ化
  const activeTasks = tasks.filter(t => t.status !== 'done')
  const tasksByEntity = entities.map(entity => ({
    entity,
    tasks: activeTasks.filter(t => t.entity_name === entity.name),
  })).filter(group => group.tasks.length > 0)

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

            {/* 部署ごとのセクション */}
            {entities.map((entity) => {
              const entityTasks = activeTasks
                .filter(t => t.entity_name === entity.name)
                .sort((a, b) => {
                  // doing(実行中)を最上部に
                  if (a.status === 'doing' && b.status !== 'doing') return -1
                  if (a.status !== 'doing' && b.status === 'doing') return 1
                  return 0
                })
              const latestCycle = cyclesByEntity[entity.id]

              // タスクもサイクルもない部署はスキップ
              if (entityTasks.length === 0 && !latestCycle) return null

              return (
                <section key={entity.id} className="mb-8 pb-6 border-b border-gray-200 last:border-b-0">
                  <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                    <span className="w-1 h-6 bg-green-600 inline-block"></span>
                    {entity.name}
                  </h2>

                  {/* 今回の議題（PDCAサイクル）を箇条書きで表示 */}
                  {latestCycle && (latestCycle.situation || latestCycle.issue || latestCycle.action || latestCycle.target) && (
                    <div className="mb-4">
                      <h3 className="text-sm font-semibold text-gray-700 mb-2">
                        ミーティング内容 ({latestCycle.cycle_date})
                      </h3>
                      <ul className="space-y-1 text-sm text-gray-700 ml-4">
                        {latestCycle.situation && (
                          <li className="flex">
                            <span className="font-semibold text-blue-700 w-16 shrink-0">現状:</span>
                            <span className="whitespace-pre-wrap">{latestCycle.situation}</span>
                          </li>
                        )}
                        {latestCycle.issue && (
                          <li className="flex">
                            <span className="font-semibold text-orange-600 w-16 shrink-0">課題:</span>
                            <span className="whitespace-pre-wrap">{latestCycle.issue}</span>
                          </li>
                        )}
                        {latestCycle.action && (
                          <li className="flex">
                            <span className="font-semibold text-green-700 w-16 shrink-0">アクション:</span>
                            <span className="whitespace-pre-wrap">{latestCycle.action}</span>
                          </li>
                        )}
                        {latestCycle.target && (
                          <li className="flex">
                            <span className="font-semibold text-purple-700 w-16 shrink-0">目標:</span>
                            <span className="whitespace-pre-wrap">{latestCycle.target}</span>
                          </li>
                        )}
                      </ul>
                    </div>
                  )}

                  {/* 進行中タスク */}
                  {entityTasks.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 mb-2">
                        進行中タスク ({entityTasks.length}件)
                      </h3>
                      <ul className="space-y-1 text-sm text-gray-700 ml-4">
                        {entityTasks.map(task => (
                          <li key={task.id} className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${
                              task.status === 'doing' ? 'bg-blue-500' :
                              task.status === 'open' ? 'bg-gray-400' :
                              task.status === 'paused' ? 'bg-yellow-500' : 'bg-green-500'
                            }`}></span>
                            <span>{task.title}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                              task.status === 'doing' ? 'bg-blue-100 text-blue-700' :
                              task.status === 'open' ? 'bg-gray-100 text-gray-600' :
                              task.status === 'paused' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'
                            }`}>
                              {STATUS_LABELS[task.status]}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </section>
              )
            })}

            {/* データがない場合 */}
            {entities.every(e => {
              const entityTasks = activeTasks.filter(t => t.entity_name === e.name)
              return entityTasks.length === 0 && !cyclesByEntity[e.id]
            }) && (
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
