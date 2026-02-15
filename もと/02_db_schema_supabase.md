# DB設計（Supabase / Postgres 想定）

> 目的：client_id単位でデータを分離し、Chart Studio / Dashboard / PDCA をDB永続化する。

---

## 1. テーブル一覧（最小）

### clients
- クライアントマスター

### charts
- グラフ定義（クライアント別）

### pdca_issues
- イシュー（テーマ）マスター

### pdca_cycles
- 1回の会議/サイクルごとの記録（履歴）

### metric_definitions（任意だが強い）
- 指標マスター（表示名、単位、使える集計など）

### kpi_facts（任意だが強い）
- KPIの実データ（ロング形式）

---

## 2. SQL（例）

> SupabaseのSQL Editorに貼って使えるレベルの雛形。

```sql
-- 0) Extensions
create extension if not exists "uuid-ossp";

-- 1) clients
create table if not exists public.clients (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  created_at timestamptz not null default now()
);

-- 2) charts
create table if not exists public.charts (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid not null references public.clients(id) on delete cascade,

  title text not null,
  type text not null check (type in ('line','bar')),
  x_key text not null default 'month',

  series_keys text[] not null default '{}',
  agg_key text not null default 'raw' check (agg_key in ('raw','yoy_diff','yoy_pct')),

  store_override text null,                 -- nullなら全体フィルタに従う
  filters jsonb not null default '{}'::jsonb, -- 例 {"store":"全店","lastN":6}

  show_on_dashboard boolean not null default false,
  sort_order int not null default 10,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists charts_client_id_idx on public.charts(client_id);
create index if not exists charts_client_sort_idx on public.charts(client_id, sort_order);

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_updated_at_charts on public.charts;
create trigger set_updated_at_charts
before update on public.charts
for each row execute function public.set_updated_at();

-- 3) pdca_issues
create table if not exists public.pdca_issues (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid not null references public.clients(id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now()
);

create index if not exists pdca_issues_client_id_idx on public.pdca_issues(client_id);

-- 4) pdca_cycles（履歴）
create table if not exists public.pdca_cycles (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid not null references public.clients(id) on delete cascade,
  issue_id uuid not null references public.pdca_issues(id) on delete cascade,

  cycle_date date not null, -- 会議日
  situation text not null default '',
  issue text not null default '',
  action text not null default '',
  target text not null default '',

  status text not null default 'open' check (status in ('open','doing','done','paused')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pdca_cycles_client_issue_date_idx
on public.pdca_cycles(client_id, issue_id, cycle_date desc);

drop trigger if exists set_updated_at_pdca_cycles on public.pdca_cycles;
create trigger set_updated_at_pdca_cycles
before update on public.pdca_cycles
for each row execute function public.set_updated_at();

-- 5) metric_definitions（任意）
create table if not exists public.metric_definitions (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid not null references public.clients(id) on delete cascade,
  metric_key text not null,         -- 'revpar','occ','adr','spend'...
  display_name text not null,
  unit text not null default '',
  allowed_aggs text[] not null default '{raw,yoy_diff,yoy_pct}',
  created_at timestamptz not null default now(),
  unique (client_id, metric_key)
);

-- 6) kpi_facts（任意）
create table if not exists public.kpi_facts (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid not null references public.clients(id) on delete cascade,
  period date not null,             -- 日次ならdate、月次なら月末日などルール化
  entity_type text not null default 'store', -- store/department/category...
  entity_key text not null,         -- '全店' / 店舗コードなど
  metric_key text not null,
  value numeric not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists kpi_facts_client_period_idx on public.kpi_facts(client_id, period);
create index if not exists kpi_facts_client_entity_metric_idx on public.kpi_facts(client_id, entity_key, metric_key);
```

---

## 3. RLS（Row Level Security）方針

最小案：
- authユーザーに `client_id` を紐づけ（profilesテーブル等）
- `charts/pdca_*` は `client_id = current_user_client_id()` のみ許可

Supabaseでは実装パターンが複数あるため、プロジェクト側の認証設計（メールログイン/パスワード/組織）に合わせて決定。

---

## 4. API設計（Next.js Route Handlers）

- `GET /api/clients/[clientId]/charts`
- `POST /api/clients/[clientId]/charts`
- `PATCH /api/clients/[clientId]/charts/[chartId]`
- `DELETE /api/clients/[clientId]/charts/[chartId]`
- `POST /api/clients/[clientId]/charts/reorder`（まとめてsortOrder更新）

- `GET /api/clients/[clientId]/pdca/issues`
- `POST /api/clients/[clientId]/pdca/issues`
- `GET /api/clients/[clientId]/pdca/issues/[issueId]/cycles`
- `POST /api/clients/[clientId]/pdca/issues/[issueId]/cycles`

