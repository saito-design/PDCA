# PDCA Google Drive アクセス引継ぎ

## 基本情報

- **プロジェクト**: PDCA Dashboard
- **作成日**: 2026-02-17
- **基本ルール**: `C:/Users/yasuh/OneDrive/デスクトップ/APP/CLAUDE.md` を参照

---

## Google Drive フォルダ構成

### PDCAルートフォルダ
- **フォルダID**: `0ACzzaasVce2zUk9PVA`
- 直下に企業名フォルダが存在

### 鳥取県市町村職員共済組合
- **フォルダID**: `1w6_HWQMVuBJglkEXMDnhLGnBWuNhGlHM`
- **URL**: https://drive.google.com/drive/folders/1w6_HWQMVuBJglkEXMDnhLGnBWuNhGlHM

#### 保存ファイル
| ファイル名 | ファイルID | 内容 |
|-----------|-----------|------|
| entities.json | `1h-GAnaMeK3AJh8T9uDSKpV70mJrR_Ft4` | 部署/カテゴリ（全体、料理、宿泊企画、サービス） |
| pdca-cycles.json | `1u6d4QmUwoV4GFnNgE4dMDiOooH2aQuJ-` | ミーティング記録（PDCAサイクル） |

---

## Driveアクセス方法

### 方法1: テスト用API（推奨）

開発サーバーが起動している状態で使用可能。

```bash
# フォルダ内のファイル一覧
curl "http://localhost:3010/api/test-drive?folderId=1w6_HWQMVuBJglkEXMDnhLGnBWuNhGlHM"

# ファイル内容を取得
curl "http://localhost:3010/api/test-drive?fileId=<ファイルID>"
```

**APIファイル**: `src/app/api/test-drive/route.ts`

### 方法2: 本番API

認証が必要。クライアントIDを指定してアクセス。

```
クライアントID: client-mloz4flk-3jld
```

---

## 注意点

### Node.js互換性問題
- Node.js v24ではOpenSSLの互換性問題あり
- CLIから直接`googleapis`を使うとエラー: `error:1E08010C:DECODER routines::unsupported`
- Next.jsの開発サーバー経由でAPIを使えばOK

### ポート
- PDCAアプリは **3010** で固定（package.jsonで設定済み）
- `npm run dev` で http://localhost:3010 で起動

### 環境変数
`.env.local`に以下が設定済み:
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PRIVATE_KEY_BASE64`
- `GOOGLE_DRIVE_PDCA_FOLDER_ID`

---

## ローカルバックアップ

workspaceにバックアップがある場合:
```
C:/Users/yasuh/OneDrive/デスクトップ/APP/workspace/PDCA/
├── clients.json
└── 鳥取県市町村職員共済組合/
    └── entities.json
```

---

## 関連ファイル

- `src/lib/drive.ts` - Drive API操作関数
- `src/lib/types.ts` - 型定義
- `test-drive.js` - テストスクリプト（Node.js v24では動作しない）
