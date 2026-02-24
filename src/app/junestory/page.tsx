'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// 旧URLから新しいクライアントページへリダイレクト
export default function JunestoryRedirectPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/clients/client-junestory')
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="text-center">
        <div className="text-lg text-gray-600 mb-2">リダイレクト中...</div>
        <a href="/clients/client-junestory" className="text-blue-600 hover:underline">
          新しいページへ移動
        </a>
      </div>
    </div>
  )
}
