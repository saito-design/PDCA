// 【】で囲まれたタスクを抽出するユーティリティ

export interface ExtractedTask {
  text: string
  status?: 'open' | 'doing' | 'done'
}

/**
 * テキストから【】で囲まれたタスクを抽出
 */
export function extractTasks(text: string): ExtractedTask[] {
  if (!text) return []

  const regex = /【([^】]+)】/g
  const tasks: ExtractedTask[] = []
  let match

  while ((match = regex.exec(text)) !== null) {
    tasks.push({
      text: match[1].trim(),
      status: 'open' // デフォルトは未着手
    })
  }

  return tasks
}

/**
 * テキストから【】で囲まれたタスク文字列のみを抽出
 * コンポーネントでのシンプルな使用向け
 */
export function extractTaskStrings(text: string): string[] {
  return extractTasks(text).map(t => t.text)
}

/**
 * テキスト内の【】部分をハイライト用にパースして返す
 * 通常テキストとタスク部分を分けて返す
 */
export interface TextPart {
  type: 'text' | 'task'
  content: string
}

export function parseTextWithTasks(text: string): TextPart[] {
  if (!text) return []

  const parts: TextPart[] = []
  const regex = /【([^】]+)】/g
  let lastIndex = 0
  let match

  while ((match = regex.exec(text)) !== null) {
    // マッチ前のテキスト
    if (match.index > lastIndex) {
      parts.push({
        type: 'text',
        content: text.slice(lastIndex, match.index)
      })
    }
    // タスク部分
    parts.push({
      type: 'task',
      content: match[1].trim()
    })
    lastIndex = match.index + match[0].length
  }

  // 残りのテキスト
  if (lastIndex < text.length) {
    parts.push({
      type: 'text',
      content: text.slice(lastIndex)
    })
  }

  return parts
}

/**
 * 複数のサイクルから全タスクを抽出
 */
export function extractAllTasks(cycles: { action: string; cycle_date: string; status: string }[]): {
  task: string
  date: string
  cycleStatus: string
}[] {
  const tasks: { task: string; date: string; cycleStatus: string }[] = []

  cycles.forEach(cycle => {
    const extracted = extractTasks(cycle.action)
    extracted.forEach(t => {
      tasks.push({
        task: t.text,
        date: cycle.cycle_date,
        cycleStatus: cycle.status
      })
    })
  })

  return tasks
}
