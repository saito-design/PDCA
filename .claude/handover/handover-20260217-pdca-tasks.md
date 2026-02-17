# 引継ぎファイル: PDCAアプリ タスク管理・レポート機能

**作成日時**: 2026-02-17
**基本ルール**: `C:/Users/yasuh/OneDrive/デスクトップ/APP/CLAUDE.md` を参照

---

## 作業中のプロジェクト

**プロジェクト**: PDCAアプリ（Next.js Web App）
**場所**: `C:/Users/yasuh/OneDrive/デスクトップ/APP/PDCA/`
**ポート**: 3010 (`npm run dev`)
**目的**: 会議中にKPI→課題→アクション→検証を一気通貫で回すPDCA管理アプリ

---

## 完了した作業

### 1. タスク管理機能
- タスクAPI追加（CRUD）
  - `src/app/api/clients/[clientId]/tasks/route.ts` - GET/POST
  - `src/app/api/clients/[clientId]/tasks/[taskId]/route.ts` - PATCH/DELETE
- タスク管理コンポーネント: `src/components/task-manager.tsx`
- 部署ダッシュボードにタスク管理セクション追加
- 進行中タスクを最上部に表示（青いボックス）

### 2. 部署ダッシュボード改善
- データ表示（KPI+グラフ）を横折りたたみに変更
- 店舗選択ボックスを削除
- 過去のミーティング履歴を編集可能に変更
- タスク追加入力欄を一番下に移動

### 3. レポート出力（HTML/A4形式）
- プレビューページ: `src/app/clients/[clientId]/entities/[entityId]/reports/preview/page.tsx`
- ビジュアルデザイン（PDCAボックス+矢印フロー）
- 進行中タスク一覧（カード形式）
- 印刷/PDF保存ボタン

---

## 主要ファイル構成

```
PDCA/src/
├── app/
│   ├── page.tsx                    # ログインページ
│   ├── clients/
│   │   ├── page.tsx                # 企業一覧
│   │   └── [clientId]/
│   │       ├── page.tsx            # 部署選択ページ ← レポートボタン未実装
│   │       ├── overview/page.tsx   # 全体ビュー（タブ: KPI / PDCA）
│   │       └── entities/[entityId]/
│   │           ├── dashboard/page.tsx  # 部署ダッシュボード
│   │           ├── charts/page.tsx     # Chart Studio
│   │           └── reports/preview/page.tsx  # レポートプレビュー
│   └── api/
│       └── clients/[clientId]/
│           ├── tasks/              # タスクAPI
│           ├── cycles/             # サイクルAPI
│           └── entities/[entityId]/pdca/issues/  # イシューAPI
├── components/
│   ├── task-manager.tsx            # タスク管理
│   ├── meeting-history.tsx         # ミーティング履歴（編集可能）
│   ├── report-export-button.tsx    # レポートボタン
│   └── overview-pdca-summary.tsx   # 全体ビューのPDCAサマリー
└── lib/
    ├── types.ts                    # 型定義（Task, PdcaCycle, PdcaStatus等）
    ├── task-utils.ts               # 【】タスク抽出ユーティリティ
    └── drive.ts                    # Google Drive連携
```

---

## 未完了・次にやること

### 優先度高
1. **企業単位でレポートボタン追加**
   - `/clients/[clientId]/page.tsx` にレポートボタンを追加
   - 全部署まとめたレポート or 部署選択式

2. **全体ビュー（overview）のデフォルトタブ確認**
   - 現在: `activeTab: 'pdca'`
   - ユーザー意図の確認が必要

3. **イシュー→タスクへの用語統一**
   - ファイル名・変数名で「issue」が残っている箇所がある
   - `pdca-issue-list.tsx`, `issues/route.ts` など
   - UIでは「タスク」に統一したい？

4. **全体コードの整合性チェック**
   - 部分修正が続いたため、不整合がないか確認

### 優先度中
5. **レポート機能の拡張**
   - 企業単位レポート（全部署まとめ）
   - 期間指定
   - Google Driveへの保存

---

## 重要な決定事項

| 項目 | 決定内容 |
|------|----------|
| データベース | 使用しない（Google Drive + JSON） |
| 認証 | iron-session |
| ステータス | `open` / `doing` / `done` / `paused` |
| レポート形式 | HTML（A4縦、印刷/PDF対応） |
| UI用語 | 「タスク」（内部では一部「issue」が残存） |

---

## 注意点・既知の問題

1. **用語の不統一**: 内部コードで「issue」「cycle」、UIで「タスク」「ミーティング」が混在
2. **データソース**: レポートAPIは一部ローカルキャッシュから読み込み（Google Driveと同期していない箇所あり）
3. **buttonネストエラー**: `meeting-history.tsx`で修正済み（buttonをdivに変更）

---

## 開発サーバー起動

```bash
cd "C:/Users/yasuh/OneDrive/デスクトップ/APP/PDCA"
npm run dev
```

http://localhost:3010
