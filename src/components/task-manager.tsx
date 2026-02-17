'use client'

import { useState } from 'react'
import {
  ListTodo,
  Circle,
  PlayCircle,
  CheckCircle,
  PauseCircle,
  Plus,
  Trash2,
  ChevronRight
} from 'lucide-react'
import type { Task, PdcaStatus } from '@/lib/types'

const STATUS_CONFIG: Record<PdcaStatus, {
  label: string
  color: string
  bgColor: string
  icon: typeof Circle
  next: PdcaStatus
}> = {
  open: {
    label: '未着手',
    color: 'text-gray-500',
    bgColor: 'bg-gray-100',
    icon: Circle,
    next: 'doing'
  },
  doing: {
    label: '進行中',
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
    icon: PlayCircle,
    next: 'done'
  },
  done: {
    label: '完了',
    color: 'text-green-600',
    bgColor: 'bg-green-100',
    icon: CheckCircle,
    next: 'open'
  },
  paused: {
    label: '保留',
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-100',
    icon: PauseCircle,
    next: 'open'
  },
}

interface TaskManagerProps {
  tasks: Task[]
  entityName: string
  clientId: string
  onStatusChange: (taskId: string, newStatus: PdcaStatus) => Promise<void>
  onAddTask: (title: string) => Promise<void>
  onDeleteTask: (taskId: string) => Promise<void>
  loading?: boolean
}

export function TaskManager({
  tasks,
  entityName,
  clientId,
  onStatusChange,
  onAddTask,
  onDeleteTask,
  loading
}: TaskManagerProps) {
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [adding, setAdding] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  // この部署のタスクのみフィルタ
  const entityTasks = tasks.filter(t => t.entity_name === entityName)

  // ステータス別に分類
  const openTasks = entityTasks.filter(t => t.status === 'open')
  const doingTasks = entityTasks.filter(t => t.status === 'doing')
  const doneTasks = entityTasks.filter(t => t.status === 'done')
  const pausedTasks = entityTasks.filter(t => t.status === 'paused')

  const handleAddTask = async () => {
    if (!newTaskTitle.trim()) return
    setAdding(true)
    try {
      await onAddTask(newTaskTitle.trim())
      setNewTaskTitle('')
    } finally {
      setAdding(false)
    }
  }

  const handleStatusChange = async (taskId: string, newStatus: PdcaStatus) => {
    setUpdatingId(taskId)
    try {
      await onStatusChange(taskId, newStatus)
    } finally {
      setUpdatingId(null)
    }
  }

  const handleDelete = async (taskId: string) => {
    if (!confirm('このタスクを削除しますか？')) return
    setUpdatingId(taskId)
    try {
      await onDeleteTask(taskId)
    } finally {
      setUpdatingId(null)
    }
  }

  const TaskItem = ({ task }: { task: Task }) => {
    const config = STATUS_CONFIG[task.status]
    const Icon = config.icon
    const isUpdating = updatingId === task.id

    return (
      <div className={`flex items-center gap-2 p-2 rounded-lg border ${isUpdating ? 'opacity-50' : ''} hover:bg-gray-50`}>
        {/* ステータスボタン */}
        <button
          onClick={() => handleStatusChange(task.id, config.next)}
          disabled={isUpdating}
          className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${config.bgColor} ${config.color} hover:opacity-80 transition-opacity`}
          title={`クリックで「${STATUS_CONFIG[config.next].label}」に変更`}
        >
          <Icon size={14} />
          {config.label}
          <ChevronRight size={12} className="opacity-50" />
        </button>

        {/* タスクタイトル */}
        <div className={`flex-1 text-sm ${task.status === 'done' ? 'line-through text-gray-400' : ''}`}>
          {task.title}
        </div>

        {/* 削除ボタン */}
        <button
          onClick={() => handleDelete(task.id)}
          disabled={isUpdating}
          className="text-gray-400 hover:text-red-500 p-1"
          title="削除"
        >
          <Trash2 size={14} />
        </button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow p-4">
        <div className="flex items-center gap-2 mb-4">
          <ListTodo size={18} className="text-green-600" />
          <h3 className="font-semibold">タスク管理</h3>
        </div>
        <div className="text-center text-gray-500 py-8">読み込み中...</div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl shadow p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ListTodo size={18} className="text-green-600" />
          <h3 className="font-semibold">タスク管理</h3>
          <span className="text-xs text-gray-400">({entityTasks.length}件)</span>
        </div>

        {/* ステータスサマリー */}
        <div className="flex items-center gap-2 text-xs">
          <span className="flex items-center gap-1 text-gray-500">
            <Circle size={12} />
            {openTasks.length}
          </span>
          <span className="flex items-center gap-1 text-blue-600">
            <PlayCircle size={12} />
            {doingTasks.length}
          </span>
          <span className="flex items-center gap-1 text-green-600">
            <CheckCircle size={12} />
            {doneTasks.length}
          </span>
        </div>
      </div>

      {/* タスク一覧 */}
      <div className="space-y-4">
        {/* 進行中 */}
        {doingTasks.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-blue-600 mb-2 flex items-center gap-1">
              <PlayCircle size={12} />
              進行中 ({doingTasks.length})
            </div>
            <div className="space-y-1">
              {doingTasks.map(task => <TaskItem key={task.id} task={task} />)}
            </div>
          </div>
        )}

        {/* 未着手 */}
        {openTasks.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1">
              <Circle size={12} />
              未着手 ({openTasks.length})
            </div>
            <div className="space-y-1">
              {openTasks.map(task => <TaskItem key={task.id} task={task} />)}
            </div>
          </div>
        )}

        {/* 保留 */}
        {pausedTasks.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-yellow-600 mb-2 flex items-center gap-1">
              <PauseCircle size={12} />
              保留 ({pausedTasks.length})
            </div>
            <div className="space-y-1">
              {pausedTasks.map(task => <TaskItem key={task.id} task={task} />)}
            </div>
          </div>
        )}

        {/* 完了（折りたたみ可能） */}
        {doneTasks.length > 0 && (
          <details className="group">
            <summary className="text-xs font-semibold text-green-600 mb-2 flex items-center gap-1 cursor-pointer list-none">
              <CheckCircle size={12} />
              完了 ({doneTasks.length})
              <ChevronRight size={12} className="group-open:rotate-90 transition-transform" />
            </summary>
            <div className="space-y-1 mt-2">
              {doneTasks.map(task => <TaskItem key={task.id} task={task} />)}
            </div>
          </details>
        )}

        {/* 空の状態 */}
        {entityTasks.length === 0 && (
          <div className="text-center text-gray-400 py-8 text-sm">
            タスクがありません
          </div>
        )}
      </div>

      {/* 新規タスク追加（一番下） */}
      <div className="flex gap-2 mt-4 pt-4 border-t">
        <input
          type="text"
          value={newTaskTitle}
          onChange={(e) => setNewTaskTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAddTask()}
          placeholder="新しいタスクを追加..."
          className="flex-1 border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
          disabled={adding}
        />
        <button
          onClick={handleAddTask}
          disabled={adding || !newTaskTitle.trim()}
          className="flex items-center gap-1 bg-green-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
        >
          <Plus size={16} />
          追加
        </button>
      </div>
    </div>
  )
}
