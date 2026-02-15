# PDCAアプリ 設計思想・仕様（IDEに渡す用）

> 目的：会議中に「KPI→課題→アクション→次回の検証」までを一気通貫で回し、PDCAを“場で”前進させる。

---

## 1. 設計思想（ブレない前提）

### 1-1. 画面の役割を分ける
- **ダッシュボード＝意思決定の場**（見る・決める）
- **Chart Studio＝分析/設計の場**（作る・選ぶ・並べる）

会議中に「グラフを作る/調整する」をやり出すと、脱線する。
だから**グラフは別ページで作って、ダッシュボードは“表示する”ものだけに絞る**。

### 1-2. PDCAは“統一”、グラフは“自由”
- PDCAは入力項目を固定（situation / issue / action / target）し、運用を標準化する
- KPI/グラフはクライアントごとに異なるため、**ピボット風の定義で自由度を担保**する

### 1-3. 1イシュー1ボックス
議論の単位を必ず1つにする（混ぜない）。
履歴比較もイシュー単位で行う。

---

## 2. 画面仕様

### 2-1. ダッシュボード（/clients/[clientId]/dashboard）
**左（KPI + 表示中のグラフ）**
- KPIカード（例：RevPAR/OCC/ADR）
- 表示中（showOnDashboard=true）のグラフだけ表示
- 表示順は `sortOrder` 昇順
- 「グラフ作成へ」ボタンで Chart Studio へ

**右（PDCA編集）**
- “今回（編集）”のみ編集可能
- 保存・Act生成（後述の自動化の入口）

### 2-2. Chart Studio（/clients/[clientId]/charts）
**左上：グラフ作成（ピボット風）**
- 形状：折れ線/棒
- 集計：raw / yoy_diff / yoy_pct（拡張予定：sum/avg/shareなど）
- フィルタ：店舗/期間（直近N件）
- 系列（メトリクス）：実績/計画/前年/客数/売上…（クライアント設定で変動）

**左下：作成済み一覧**
- 「表示する」トグルでダッシュボード反映
- 削除
- **ドラッグで並び替え**（この順でダッシュボードにも出る）

**右：プレビュー**
- 作成済みの先頭数件をプレビュー（実装は任意）

---

## 3. データ仕様（重要）

### 3-1. グラフ定義（chart definition）
- `id`：UUID
- `client_id`：クライアントID
- `title`：表示タイトル
- `type`：`line` | `bar`
- `xKey`：例 `month`（将来は day/hour 等も）
- `seriesKeys`：例 `["actual","target","lastYear"]`
- `aggKey`：`raw` | `yoy_diff` | `yoy_pct`
- `filters`：例 `{ store: "全店", lastN: 6 }`（グローバル/ローカルの設計は後述）
- `storeOverride`：特定グラフだけ店舗固定したい場合（nullならグローバルに従う）
- `showOnDashboard`：boolean
- `sortOrder`：number（10刻み推奨）
- `created_at` / `updated_at`

### 3-2. KPIデータ（KPI fact）
推奨：**ロング形式（factテーブル）**で保持し、UI側で必要に応じてピボットする。
- `client_id`
- `period`（日付 or YYYY-MM）
- `metric_id`（売上、客数、RevPAR…）
- `entity`（店舗/部門/カテゴリ等の次元）
- `value`

> UIは「指標マスター（metric definitions）」を参照して、表示名・単位・使える集計を決める。

### 3-3. PDCA（issue + history）
- `issue_id`
- `client_id`
- `issue_title`（例：朝食単価アップ）
- `cycle_date`（会議日）
- `situation` / `issue` / `action` / `target`
- `status`（open / doing / done / paused など）
- `created_at` / `updated_at`

履歴は `cycle_date` で並べ、「前回」「前々回」をデフォルト表示。

---

## 4. 並び順（sortOrder）仕様
- Chart Studioで並び替えた結果を `sortOrder` に保存
- **表示順＝sortOrder昇順**
- 並び替え後は 10刻みで振り直す（安定・差し込みやすい）

---

## 5. 自動化の入口（Act生成）
現段階はボタンのみだが、将来の方針：
- KPI異常（例：前年差マイナス継続）→ issue候補提案
- 過去の成功施策テンプレートを参照して action案提示
- ただし、**決定は人間**（会議の場でFix）

---

## 6. 推奨技術スタック
- Next.js（App Router）
- Tailwind CSS
- Recharts
- DB：Supabase（Postgres）推奨（RLSで client_id 分離が楽）
  - Firestoreでも可能だが、検索/集計は工夫が必要

---

## 7. 実装の最小ゴール（MVP）
1) クライアント別 routing
2) Chart Studio でグラフ定義を CRUD + 並び替え + showOnDashboard
3) Dashboard で showOnDashboard のみ描画
4) PDCAを issue単位で保存・履歴表示（前回/前々回 + 任意選択）

