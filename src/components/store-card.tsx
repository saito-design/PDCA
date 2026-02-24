'use client'

import { Store } from '@/lib/types'

interface StoreCardProps {
  store: Store
  onClick?: () => void
  selected?: boolean
}

const brandColors: Record<string, string> = {
  kintaro: 'bg-yellow-500',
  toriyaro: 'bg-red-500',
  kintaro_single: 'bg-orange-500',
  uoemon: 'bg-blue-500',
}

const rankColors: Record<string, string> = {
  S: 'bg-purple-600 text-white',
  A: 'bg-red-600 text-white',
  B: 'bg-orange-500 text-white',
  C: 'bg-yellow-500 text-black',
  D: 'bg-green-500 text-white',
  E: 'bg-teal-500 text-white',
  F: 'bg-blue-500 text-white',
  G: 'bg-indigo-500 text-white',
  H: 'bg-gray-500 text-white',
  I: 'bg-gray-400 text-white',
}

export function StoreCard({ store, onClick, selected }: StoreCardProps) {
  const brandColor = brandColors[store.brand] || 'bg-gray-500'
  const rankColor = rankColors[store.rank] || 'bg-gray-300'

  return (
    <div
      onClick={onClick}
      className={`
        p-4 rounded-lg border-2 cursor-pointer transition-all
        ${selected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-400'}
      `}
    >
      {/* ヘッダー: 業態バッジ + ランク */}
      <div className="flex items-center justify-between mb-2">
        <span className={`px-2 py-0.5 rounded text-xs text-white ${brandColor}`}>
          {store.brand_name}
        </span>
        <span className={`px-2 py-0.5 rounded text-xs font-bold ${rankColor}`}>
          {store.rank} ({store.rank_score})
        </span>
      </div>

      {/* 店舗名 */}
      <h3 className="font-bold text-lg mb-2">{store.name}</h3>

      {/* 詳細情報 */}
      <div className="text-sm text-gray-600 space-y-1">
        <div className="flex justify-between">
          <span>店長:</span>
          <span className="font-medium">{store.manager_name || '-'}</span>
        </div>
        <div className="flex justify-between">
          <span>立地:</span>
          <span className="text-xs">{store.location_type || '-'}</span>
        </div>
        {store.management_score && (
          <div className="flex justify-between">
            <span>MGTスコア:</span>
            <span className="font-medium">{store.management_score}</span>
          </div>
        )}
      </div>

      {/* 店舗コード */}
      <div className="mt-2 pt-2 border-t text-xs text-gray-400">
        店番: {store.store_code}
      </div>
    </div>
  )
}

interface StoreListProps {
  stores: Store[]
  selectedStoreCode?: string
  onSelect?: (store: Store) => void
  filterBrand?: string
}

export function StoreList({ stores, selectedStoreCode, onSelect, filterBrand }: StoreListProps) {
  const filteredStores = filterBrand
    ? stores.filter(s => s.brand === filterBrand)
    : stores

  // ランクスコアでソート（降順）
  const sortedStores = [...filteredStores].sort((a, b) =>
    (b.rank_score || 0) - (a.rank_score || 0)
  )

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {sortedStores.map(store => (
        <StoreCard
          key={store.store_code}
          store={store}
          selected={store.store_code === selectedStoreCode}
          onClick={() => onSelect?.(store)}
        />
      ))}
    </div>
  )
}

interface StoreFilterProps {
  brands: { code: string; name: string }[]
  selectedBrand?: string
  onSelect: (brand: string | undefined) => void
}

export function StoreFilter({ brands, selectedBrand, onSelect }: StoreFilterProps) {
  return (
    <div className="flex gap-2 flex-wrap">
      <button
        onClick={() => onSelect(undefined)}
        className={`px-3 py-1 rounded text-sm ${
          !selectedBrand ? 'bg-blue-500 text-white' : 'bg-gray-200 hover:bg-gray-300'
        }`}
      >
        全て
      </button>
      {brands.map(brand => (
        <button
          key={brand.code}
          onClick={() => onSelect(brand.code)}
          className={`px-3 py-1 rounded text-sm ${
            selectedBrand === brand.code ? 'bg-blue-500 text-white' : 'bg-gray-200 hover:bg-gray-300'
          }`}
        >
          {brand.name}
        </button>
      ))}
    </div>
  )
}
