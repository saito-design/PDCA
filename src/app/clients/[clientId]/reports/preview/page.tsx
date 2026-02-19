'use client'

import { useState, useEffect, use, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { FileDown, ArrowLeft, Scissors, Mail, Save, X } from 'lucide-react'
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

  // 改ページ位置を管理（部署IDのセット）
  const [pageBreaks, setPageBreaks] = useState<Set<string>>(new Set())
  // 編集モード
  const [editMode, setEditMode] = useState(false)
  // 保存中状態
  const [saving, setSaving] = useState(false)
  // 自動処理フラグ
  const [autoProcess, setAutoProcess] = useState(false)

  // メール作成（useCallback）
  const openEmailClient = useCallback(() => {
    const subject = encodeURIComponent('ミーティングメモを送ります')
    const body = encodeURIComponent(
      `\nお世話になっております。\n先日のミーティングメモを送ります。\nご査収くださいませ。\n\n（今回導入したツールで作成していますので、稀々ではありますがご容赦ください）\n`
    )
    window.location.href = `mailto:?subject=${subject}&body=${body}`
  }, [])

  // ドライブ保存（useCallback）
  const saveToDrive = useCallback(async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/reports/save-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageBreaks: Array.from(pageBreaks) }),
      })
      const data = await res.json()
      return data.success
    } catch (error) {
      console.error('Save error:', error)
      return false
    } finally {
      setSaving(false)
    }
  }, [clientId, pageBreaks])

  // 印刷後の自動処理（afterprintイベント）
  useEffect(() => {
    const handleAfterPrint = async () => {
      if (autoProcess) {
        setAutoProcess(false)
        // Drive保存
        await saveToDrive()
        // メール起動
        openEmailClient()
      }
    }
    window.addEventListener('afterprint', handleAfterPrint)
    return () => window.removeEventListener('afterprint', handleAfterPrint)
  }, [autoProcess, saveToDrive, openEmailClient])

  // PDF保存→Drive保存→メール（印刷ダイアログ経由）
  const handlePdfAndProcess = useCallback(() => {
    setAutoProcess(true)
    window.print()
  }, [])

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

        // まとめJSONから全タスク・全サイクルを一括取得
        const [allTasksRes, allCyclesRes] = await Promise.all([
          fetch(`/api/clients/${clientId}/all-tasks`),
          fetch(`/api/clients/${clientId}/all-cycles`),
        ])

        const allTasksData = await allTasksRes.json()
        const allCyclesData = await allCyclesRes.json()

        if (allTasksData.success) {
          setTasks(allTasksData.data)
        }

        // サイクルを部署ごとに最新のものを抽出
        if (allCyclesData.success && entitiesData.success) {
          const cyclesMap: Record<string, PdcaCycle | null> = {}
          for (const entity of entitiesData.data) {
            const entityCycles = allCyclesData.data.filter(
              (c: PdcaCycle) => c.entity_id === entity.id
            )
            if (entityCycles.length > 0) {
              // 最新のサイクルを取得
              const sorted = [...entityCycles].sort(
                (a: PdcaCycle, b: PdcaCycle) => {
                  const dateDiff = new Date(b.cycle_date).getTime() - new Date(a.cycle_date).getTime()
                  if (dateDiff !== 0) return dateDiff
                  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                }
              )
              cyclesMap[entity.id] = sorted[0]
            } else {
              cyclesMap[entity.id] = null
            }
          }
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

  // 改ページをトグル
  const togglePageBreak = (entityId: string) => {
    if (!editMode) return
    const newBreaks = new Set(pageBreaks)
    if (newBreaks.has(entityId)) {
      newBreaks.delete(entityId)
    } else {
      newBreaks.add(entityId)
    }
    setPageBreaks(newBreaks)
  }

  const handleBack = () => {
    router.push(`/clients/${clientId}`)
  }

  // 完了以外のタスクを部署ごとにグループ化
  const activeTasks = tasks.filter(t => t.status !== 'done')

  // 表示対象の部署（タスクまたはサイクルがある部署のみ）
  const visibleEntities = entities.filter(entity => {
    const entityTasks = activeTasks.filter(t => t.entity_name === entity.name)
    const latestCycle = cyclesByEntity[entity.id]
    return entityTasks.length > 0 || latestCycle
  })

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

        <div className="flex items-center gap-2">
          {/* 編集モードトグル */}
          <button
            onClick={() => setEditMode(!editMode)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
              editMode
                ? 'bg-orange-500 text-white hover:bg-orange-600'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            <Scissors size={20} />
            {editMode ? '編集中' : 'ページ分割設定'}
          </button>

          {/* メール作成のみ */}
          <button
            onClick={openEmailClient}
            className="flex items-center gap-2 bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600"
          >
            <Mail size={20} />
            メールのみ
          </button>

          {/* PDF保存→Drive保存→メール（一括処理） */}
          <button
            onClick={handlePdfAndProcess}
            disabled={saving}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            <FileDown size={20} />
            <Save size={16} />
            <Mail size={16} />
            {saving ? '保存中...' : 'PDF → 保存 → メール'}
          </button>
        </div>
      </div>

      {/* 編集モード説明 */}
      {editMode && (
        <div className="print:hidden bg-orange-50 border-b border-orange-200 p-3 text-center text-sm text-orange-800">
          部署名の左側にある「✂」マークをクリックすると、その部署の前で改ページします
        </div>
      )}

      {/* レポート本体 */}
      <div className="bg-gray-100 min-h-screen print:bg-white print:min-h-0">
        <div className="max-w-[210mm] mx-auto bg-white shadow-lg print:shadow-none">
          {/* A4用紙スタイル */}
          <div className="p-[20mm] print:p-[15mm]" style={{ fontFamily: '"Noto Sans JP", "Hiragino Sans", sans-serif' }}>

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
            {visibleEntities.map((entity, index) => {
              const entityTasks = activeTasks
                .filter(t => t.entity_name === entity.name)
                .sort((a, b) => {
                  // doing(実行中)を最上部に
                  if (a.status === 'doing' && b.status !== 'doing') return -1
                  if (a.status !== 'doing' && b.status === 'doing') return 1
                  return 0
                })
              const latestCycle = cyclesByEntity[entity.id]
              const hasPageBreak = pageBreaks.has(entity.id)

              return (
                <div key={entity.id}>
                  {/* 改ページマーカー（最初の部署以外） */}
                  {index > 0 && (
                    <div
                      className={`relative print:hidden ${editMode ? 'cursor-pointer' : ''}`}
                      onClick={() => togglePageBreak(entity.id)}
                    >
                      {editMode && (
                        <div className={`flex items-center justify-center py-2 my-2 border-2 border-dashed rounded ${
                          hasPageBreak
                            ? 'border-red-400 bg-red-50'
                            : 'border-gray-300 hover:border-orange-400 hover:bg-orange-50'
                        }`}>
                          <Scissors size={16} className={hasPageBreak ? 'text-red-500' : 'text-gray-400'} />
                          <span className={`ml-2 text-sm ${hasPageBreak ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                            {hasPageBreak ? '← ここで改ページ（クリックで解除）' : 'クリックで改ページ挿入'}
                          </span>
                          {hasPageBreak && (
                            <X size={14} className="ml-2 text-red-500" />
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 改ページ用のスタイル */}
                  <section
                    className={`mb-8 pb-6 border-b border-gray-200 last:border-b-0 ${
                      hasPageBreak ? 'page-break print:break-before-page print:pt-8' : ''
                    }`}
                  >
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
                </div>
              )
            })}

            {/* データがない場合 */}
            {visibleEntities.length === 0 && (
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
            margin: 15mm;
          }
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .print\\:break-before-page {
            break-before: page;
            page-break-before: always;
          }
        }
      `}</style>
    </>
  )
}
