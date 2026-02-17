'use client'

import { useRouter } from 'next/navigation'
import { FileText } from 'lucide-react'

interface ReportExportButtonProps {
  clientId: string
  entityId: string
}

export function ReportExportButton({ clientId, entityId }: ReportExportButtonProps) {
  const router = useRouter()

  const handleClick = () => {
    router.push(`/clients/${clientId}/entities/${entityId}/reports/preview`)
  }

  return (
    <button
      onClick={handleClick}
      className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800"
    >
      <FileText size={16} />
      レポート
    </button>
  )
}
