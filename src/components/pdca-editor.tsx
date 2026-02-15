'use client'

import { useState, useMemo } from 'react'
import { Save, Sparkles, ChevronDown, ChevronUp, CheckSquare, Square } from 'lucide-react'

interface PdcaData {
  situation: string
  issue: string
  action: string
  target: string
}

interface PdcaEditorProps {
  issueTitle?: string
  initialData?: PdcaData
  onSave?: (data: PdcaData) => void
}

const FIELDS = [
  { key: 'situation', label: '現状（S）', placeholder: '現在の状況を記入...', rows: 2 },
  { key: 'issue', label: '課題', placeholder: '課題・問題点を記入...', rows: 2 },
  { key: 'action', label: 'アクション（A）', placeholder: '具体的な施策を記入...\n【タスク名】と書くとタスク一覧に表示されます', rows: 4 },
  { key: 'target', label: '目標（T）', placeholder: '達成目標を記入...', rows: 2 },
] as const

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

export function PdcaEditor({ issueTitle, initialData, onSave }: PdcaEditorProps) {
  const [data, setData] = useState<PdcaData>(
    initialData || {
      situation: '',
      issue: '',
      action: '',
      target: '',
    }
  )
  const [expanded, setExpanded] = useState(true)
  const [saving, setSaving] = useState(false)

  // アクション欄からタスクを抽出
  const tasks = useMemo(() => extractTasks(data.action), [data.action])

  const handleChange = (key: keyof PdcaData, value: string) => {
    setData((prev) => ({ ...prev, [key]: value }))
  }

  const handleSave = async () => {
    if (!onSave) return
    setSaving(true)
    try {
      await onSave(data)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow">
      {/* Header */}
      <div
        className="flex items-center justify-between p-4 border-b cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div>
          <div className="font-bold">{issueTitle || 'ミーティングメモ'}</div>
          <div className="text-xs text-gray-500">会議中に入力</div>
        </div>
        <button className="p-1 hover:bg-gray-100 rounded">
          {expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>
      </div>

      {/* Content */}
      {expanded && (
        <div className="p-4 space-y-4">
          {FIELDS.map((field) => (
            <div key={field.key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {field.label}
              </label>
              <textarea
                className="w-full border rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
                style={{ minHeight: `${field.rows * 1.5 + 1.5}rem` }}
                placeholder={field.placeholder}
                value={data[field.key]}
                onChange={(e) => handleChange(field.key, e.target.value)}
              />
            </div>
          ))}

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
            <button
              className="flex items-center gap-2 border border-gray-300 px-4 py-2 rounded-xl font-medium hover:bg-gray-50"
              title="AI提案（将来機能）"
              disabled
            >
              <Sparkles size={16} />
              Act生成
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// タスク抽出関数もエクスポート
export { extractTasks }
