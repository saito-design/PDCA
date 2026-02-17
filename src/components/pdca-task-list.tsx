'use client'

import { Plus, FileText } from 'lucide-react'
import type { PdcaTask } from '@/lib/types'

interface PdcaTaskListProps {
  tasks: PdcaTask[]
  selectedId: string | null
  onSelect: (id: string) => void
  onAdd: () => void
}

export function PdcaTaskList({ tasks, selectedId, onSelect, onAdd }: PdcaTaskListProps) {
  return (
    <div className="bg-white rounded-2xl shadow p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">タスク一覧</h3>
        <button
          onClick={onAdd}
          className="flex items-center gap-1 text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700"
        >
          <Plus size={14} />
          新規
        </button>
      </div>

      <div className="space-y-2">
        {tasks.map((task) => (
          <button
            key={task.id}
            onClick={() => onSelect(task.id)}
            className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-colors ${
              selectedId === task.id
                ? 'bg-blue-50 border-blue-200 border'
                : 'hover:bg-gray-50 border border-transparent'
            }`}
          >
            <FileText
              size={18}
              className={selectedId === task.id ? 'text-blue-600' : 'text-gray-400'}
            />
            <div className="min-w-0 flex-1">
              <div className="font-medium truncate">{task.title}</div>
              <div className="text-xs text-gray-500">
                作成: {new Date(task.created_at).toLocaleDateString('ja-JP')}
              </div>
            </div>
          </button>
        ))}

        {tasks.length === 0 && (
          <div className="text-center text-gray-500 py-4 text-sm">
            タスクがありません
          </div>
        )}
      </div>
    </div>
  )
}
