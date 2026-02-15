import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'PDCA Dashboard',
  description: '部署/店舗単位でPDCAサイクルを管理',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ja">
      <body className="antialiased">{children}</body>
    </html>
  )
}
