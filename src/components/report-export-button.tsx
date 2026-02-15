'use client'

import { useState } from 'react'
import { Download, ExternalLink, Loader2 } from 'lucide-react'

interface ReportExportButtonProps {
  clientId: string
  entityId: string
}

export function ReportExportButton({ clientId, entityId }: ReportExportButtonProps) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ fileId: string; webViewLink: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleExport = async () => {
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch(
        `/api/clients/${clientId}/entities/${entityId}/reports/export`,
        { method: 'POST' }
      )
      const data = await res.json()

      if (!data.success) {
        setError(data.error || 'エクスポートに失敗しました')
        return
      }

      setResult(data.data)

      // ローカルファイルの場合は自動ダウンロード
      if (data.data.fileId === 'local' && data.data.webViewLink.startsWith('data:')) {
        const link = document.createElement('a')
        link.href = data.data.webViewLink
        link.download = `PDCA_Report_${new Date().toISOString().slice(0, 10)}.md`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      }
    } catch {
      setError('ネットワークエラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleExport}
        disabled={loading}
        className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50"
      >
        {loading ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <Download size={16} />
        )}
        {loading ? 'エクスポート中...' : 'レポート出力'}
      </button>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
          {error}
        </div>
      )}

      {result && result.fileId !== 'local' && (
        <a
          href={result.webViewLink}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
        >
          <ExternalLink size={14} />
          Google Driveで開く
        </a>
      )}

      {result && result.fileId === 'local' && (
        <div className="text-sm text-green-600">
          ダウンロードが開始されました
        </div>
      )}
    </div>
  )
}
