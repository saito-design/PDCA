# PDCA Dashboard - プロジェクト仕様書

## 概要
PDCA管理ダッシュボード。複数企業のPDCAサイクルを管理し、タスク進捗を可視化するWebアプリケーション。

## 技術スタック
- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS
- Google Drive API（データ永続化）

## データストレージ

### 基本方針
- **DBは使わない**: Supabase等のデータベースは使用しない
- **Google Drive + JSON**: データはGoogle Drive内のJSONファイルで管理
- **ローカル開発 → Vercelデプロイ**

### Google Driveフォルダ構造

```
G:/共有ドライブ/PDCA/
├── clients.json                    # 企業マスター
├── master_database.json            # 全企業統合データ（オプション）
│
├── 鹿児島県市町村職員共済組合/      # 企業フォルダ（drive_folder_id）
│   ├── entities.json               # 部署/店舗一覧
│   ├── tasks.json                  # タスク一覧（サマリー用）
│   ├── pdca-issues.json            # PDCAタスク（部署ダッシュボード用）
│   ├── pdca-cycles.json            # PDCAサイクル記録
│   └── unified_data.json           # Excelインポートデータ
│
└── 鳥取県市町村職員共済組合/        # 別企業フォルダ
    └── ...
```

## JSONファイル仕様

### 1. clients.json（企業マスター）
PDCAルートフォルダに配置。全企業の一覧。

```json
[
  {
    "id": "client-xxxxx",           // 企業ID
    "name": "鹿児島県市町村職員共済組合",
    "drive_folder_id": "1amsHK...", // Google DriveフォルダID
    "created_at": "2026-02-17T10:32:22.548Z"
  }
]
```

### 2. entities.json（部署/店舗一覧）
各企業フォルダに配置。

```json
[
  {
    "id": "client-xxxxx-1771375493511",
    "client_id": "client-xxxxx",
    "name": "管理",
    "sort_order": 100,
    "created_at": "2026-02-18T00:44:53.512Z"
  }
]
```

### 3. tasks.json（タスク一覧 - サマリー用）
**用途**: 全体ビュー（PDCAサマリー）のタスク一覧表示に使用。

```json
[
  {
    "id": "task-1",
    "client_id": "client-xxxxx",
    "entity_name": "管理",           // 部署名を直接保持
    "title": "管理系コスト削減の方向性検討",
    "status": "open",                // open | doing | done | paused
    "date": "2026-02-18",
    "created_at": "2026-02-18T01:14:17.060Z",
    "updated_at": "2026-02-18T01:14:17.060Z"
  }
]
```

**取得API**: `GET /api/clients/{clientId}/tasks`

### 4. pdca-issues.json（PDCAタスク - 部署ダッシュボード用）
**用途**: 部署別ダッシュボードでのPDCAタスク管理。

```json
[
  {
    "id": "task-1",
    "client_id": "client-xxxxx",
    "entity_id": "client-xxxxx-1771375493511",  // 部署IDで紐付け
    "title": "管理系コスト削減の方向性検討",
    "status": "open",
    "created_at": "2026-02-18T01:14:17.060Z",
    "updated_at": "2026-02-18T01:14:17.060Z"
  }
]
```

**取得API**:
- 全社: `GET /api/clients/{clientId}/pdca-tasks`
- 部署別: `GET /api/clients/{clientId}/entities/{entityId}/pdca/tasks`

### 5. pdca-cycles.json（PDCAサイクル記録）
**用途**: PDCAサイクル（Plan-Do-Check-Act）の記録。タスクに紐付く。

```json
[
  {
    "id": "cycle-xxxxx",
    "client_id": "client-xxxxx",
    "issue_id": "task-1",            // pdca-issues.jsonのIDと紐付け
    "cycle_date": "2026-02-18",
    "situation": "現状...",          // 状況
    "issue": "課題...",              // 課題
    "action": "【タスク1】【タスク2】",  // アクション（【】でタスク記載）
    "target": "目標...",             // 目標
    "status": "open",
    "created_at": "2026-02-18T01:14:17.060Z",
    "updated_at": "2026-02-18T01:14:17.060Z"
  }
]
```

**取得API**: `GET /api/clients/{clientId}/entities/{entityId}/pdca/tasks/{taskId}/cycles`

### 6. unified_data.json（Excelインポートデータ）
**用途**: Excelから変換した業務データ。レポート生成等に使用。

```json
{
  "source_file": "報告 2026.2.18.xlsx",
  "converted_at": "2026-02-18 08:55:28",
  "client_id": "client-xxxxx",
  "client_name": "鹿児島県市町村職員共済組合",
  "total_records": 1947,
  "total_columns": 69,
  "columns": ["_client_id", "_client_name", "_sheet", "_row", ...],
  "data": [...]
}
```

## データの関連図

```
clients.json
    │
    └── [企業フォルダ]
            │
            ├── entities.json ──────────┐
            │       │                   │
            │       └── entity_id ──────┼──→ pdca-issues.json
            │                           │           │
            ├── tasks.json              │           └── issue_id
            │   (サマリー表示用)         │                  │
            │                           │                  ↓
            │                           │         pdca-cycles.json
            │                           │
            └── unified_data.json ──────┘
                (Excelデータ)
```

## 注意事項

### tasks.json と pdca-issues.json の違い
| 項目 | tasks.json | pdca-issues.json |
|------|-----------|------------------|
| 用途 | サマリー画面のタスク一覧 | 部署ダッシュボードのPDCA管理 |
| 部署参照 | `entity_name`（名前） | `entity_id`（ID） |
| 日付 | `date`あり | `date`なし |
| PDCAサイクル紐付け | なし | あり（cycles.jsonから参照） |

### PDCAサイクル登録時の注意
- `pdca-cycles.json`の`action`フィールドに【】で囲んでタスクを記載
- 現状、`action`の内容は`tasks.json`に**自動反映されない**
- サマリーに表示するには手動で`tasks.json`に追加が必要

### 将来の改善案
1. PDCAサイクル登録時に`action`から自動的にタスクを抽出
2. `tasks.json`と`pdca-issues.json`の統合
3. リアルタイム同期機能

## 環境変数

```bash
# Google Drive API
GOOGLE_SERVICE_ACCOUNT_EMAIL=xxxxx@xxxxx.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY_BASE64=...
GOOGLE_DRIVE_PDCA_FOLDER_ID=...  # PDCAルートフォルダID

# セッション
SESSION_PASSWORD=...
```

## コマンド

```bash
npm run dev      # 開発サーバー起動（localhost:3010）
npm run build    # プロダクションビルド
npm run start    # プロダクション起動
```
