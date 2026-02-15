'use client'

import { useState, useEffect } from 'react'
import { Save, Sparkles, Calendar } from 'lucide-react'
import type { PdcaCycle, PdcaStatus } from '@/lib/types'

interface PdcaCycleEditorProps {
  cycle?: PdcaCycle
  issueTitle: string
  onSave: (data: Partial<PdcaCycle>) => Promise<void>
  onStatusChange?: (status: PdcaStatus) => void
}

const STATUS_OPTIONS: { value: PdcaStatus; label: string }[] = [
  { value: 'open', label: '未着手' },
  { value: 'doing', label: '進行中' },
  { value: 'done', label: '完了' },
  { value: 'paused', label: '保留' },
]

const FIELDS = [
  { key: 'situation', label: '現状（S）', placeholder: '現在の状況を記入...' },
  { key: 'issue', label: '課題（I）', placeholder: '課題・問題点を記入...' },
  { key: 'action', label: 'アクション（A）', placeholder: '具体的な施策を記入...' },
  { key: 'target', label: '目標（T）', placeholder: '達成目標を記入...' },
] as const

type FieldKey = typeof FIELDS[number]['key']

export function PdcaCycleEditor({ cycle, issueTitle, onSave, onStatusChange }: PdcaCycleEditorProps) {
  const [data, setData] = useState({
    situation: '',
    issue: '',
    action: '',
    target: '',
  })
  const [status, setStatus] = useState<PdcaStatus>('open')
  const [cycleDate, setCycleDate] = useState(new Date().toISOString().split('T')[0])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (cycle) {
      setData({
        situation: cycle.situation || '',
        issue: cycle.issue || '',
        action: cycle.action || '',
        target: cycle.target || '',
      })
      setStatus(cycle.status)
      setCycleDate(cycle.cycle_date)
    } else {
      setData({ situation: '', issue: '', action: '', target: '' })
      setStatus('open')
      setCycleDate(new Date().toISOString().split('T')[0])
    }
  }, [cycle])

  const handleChange = (key: FieldKey, value: string) => {
    setData((prev) => ({ ...prev, [key]: value }))
  }

  const handleStatusChange = (newStatus: PdcaStatus) => {
    setStatus(newStatus)
    onStatusChange?.(newStatus)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave({
        id: cycle?.id,
        cycle_date: cycleDate,
        situation: data.situation,
        issue: data.issue,
        action: data.action,
        target: data.target,
        status,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow">
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="font-bold text-lg">{issueTitle}</div>
            <div className="text-xs text-gray-500 mt-1">
              {cycle ? '既存サイクルを編集中' : '新規サイクルを作成'}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-sm">
              <Calendar size={14} className="text-gray-500" />
              <input
                type="date"
                value={cycleDate}
                onChange={(e) => setCycleDate(e.target.value)}
                className="border rounded px-2 py-1 text-sm"
              />
            </div>
          </div>
        </div>

        {/* Status */}
        <div className="flex gap-2 mt-4">
          {STATUS_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => handleStatusChange(option.value)}
              className={`px-3 py-1 rounded-full text-sm ${
                status === option.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {FIELDS.map((field) => (
          <div key={field.key}>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {field.label}
            </label>
            <textarea
              className="w-full border rounded-lg p-3 min-h-[80px] text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder={field.placeholder}
              value={data[field.key]}
              onChange={(e) => handleChange(field.key, e.target.value)}
            />
          </div>
        ))}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            <Save size={16} />
            {saving ? '保存中...' : cycle ? '更新' : '作成'}
          </button>
          <button
            className="flex items-center gap-2 border border-gray-300 px-4 py-2 rounded-xl font-medium hover:bg-gray-50 disabled:opacity-50"
            title="AI提案（将来機能）"
            disabled
          >
            <Sparkles size={16} />
            Act生成
          </button>
        </div>
      </div>
    </div>
  )
}
