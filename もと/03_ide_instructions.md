# IDEに渡す実装指示（そのままコピペ用）

## ゴール
- クライアント別に **Chart Studio** でグラフ定義を作成・保存
- 「表示する」ONのグラフだけ **Dashboard** に表示（sortOrder順）
- PDCAは **1イシュー1ボックス**で履歴保存（前回/前々回 + 任意選択）

---

## 1. ルーティング（Next.js App Router）
- `/clients/[clientId]/dashboard`
- `/clients/[clientId]/charts`

API：
- `/api/clients/[clientId]/charts/*`
- `/api/clients/[clientId]/pdca/*`

---

## 2. UI要件（最重要）
### Dashboard
- 左：KPIカード + `showOnDashboard=true` の charts を `sortOrder`順で描画
- 右：PDCAの“今回（編集）”のみ編集可（保存ボタン）
- 「グラフ作成へ」ボタンで Chart Studio に遷移

### Chart Studio
- グラフ作成：形状/集計/フィルタ/系列を選び `POST charts`
- 作成済み一覧：
  - 「表示する」トグル → `PATCH charts/{id}`（showOnDashboard）
  - 削除 → `DELETE charts/{id}`
  - ドラッグで並び替え → reorder API（sortOrder一括更新）
- 右：プレビュー（任意）

---

## 3. データ設計（最小で動かす）
### charts（必須）
- id, client_id, title, type, x_key, series_keys, agg_key, filters, store_override, show_on_dashboard, sort_order

### pdca（必須）
- issues：id, client_id, title
- cycles：issue_id, cycle_date, situation, issue, action, target, status

---

## 4. 実装順（推奨）
1) DB（Supabase）に tables 作成
2) charts CRUD API
3) Chart Studio UI（作成・一覧・表示トグル・削除）
4) reorder API + UI（ドラッグ&ドロップ）
5) Dashboard（表示グラフのみ）
6) PDCA issues/cycles の CRUD + 履歴UI

---

## 5. 注意点（落とし穴）
- showOnDashboardは「表示する」ONのものだけ
- sortOrderは10刻みで保存（後から差し込みやすい）
- KPI fact は最初はダミーでもOK（chartsの永続化が先）

