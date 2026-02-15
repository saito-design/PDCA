'use client'

import { useState, useMemo } from 'react'
import { Save, CheckSquare, Square } from 'lucide-react'

interface MeetingNotesProps {
  initialNotes?: string
  onSave?: (notes: string) => void
}

// 【】で囲まれたタスクを抽出
function extractTasks(text: string): string[] {
  const regex = /【([^】]+)】/g
  const tasks: string[] = []
  let match
  while ((match = regex.exec(text)) !== null) {
    tasks.push(match[1].trim())
  }
  return tasks
}

export function MeetingNotes({ initialNotes = '', onSave }: MeetingNotesProps) {
  const [notes, setNotes] = useState(initialNotes)
  const [saving, setSaving] = useState(false)

  // タスク抽出
  const tasks = useMemo(() => extractTasks(notes), [notes])

  const handleSave = async () => {
    if (!onSave) return
    setSaving(true)
    try {
      await onSave(notes)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div>
          <div className="font-bold">ミーティングメモ</div>
          <div className="text-xs text-gray-500">【タスク名】と書くとタスク一覧に表示されます</div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* メモ欄 */}
        <textarea
          className="w-full border rounded-lg p-3 min-h-[200px] text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
          placeholder="会議の内容、検討事項、決定事項などを記入...

例：
・現状: RevPARは前年比-5%で推移
・課題: 平日稼働率が低い
・【平日プラン企画書を作成】← タスクとして抽出
・【来週までに競合調査】← タスクとして抽出"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        {/* タスクサマリー */}
        {tasks.length > 0 && (
          <div className="rounded-xl border bg-blue-50 p-3">
            <div className="flex items-center gap-2 mb-2">
              <CheckSquare size={16} className="text-blue-600" />
              <span className="text-sm font-semibold text-blue-800">タスク一覧</span>
              <span className="text-xs text-blue-600">({tasks.length}件)</span>
            </div>
            <ul className="space-y-1">
              {tasks.map((task, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <Square size={14} className="text-blue-400 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700">{task}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            <Save size={16} />
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

// タスク抽出用のユーティリティ関数もエクスポート
export { extractTasks }
