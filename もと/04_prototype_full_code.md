# Pdca Dashboard Ui Prototype（フルコード）

以下は現時点のCanvasプロトタイプ（React/Next.js想定）の全コード。

```jsx
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  Legend,
  ResponsiveContainer,
} from "recharts";

// =====================
// 1) KPI / PDCA（ダッシュボード本体）
// =====================

const kpis = [
  { name: "RevPAR", target: 12000, actual: 10500 },
  { name: "OCC", target: 85, actual: 78 },
  { name: "ADR", target: 14000, actual: 13500 },
];

// サンプルデータ：DB連動後は「期間×指標×次元（店舗/部門/カテゴリ…）」のロング形式から生成する想定
const monthlyData = [
  {
    month: "2025/08",
    actual: 9800,
    target: 11000,
    lastYear: 10200,
    guests: 3200,
    spend: 9800,
    store: "全店",
  },
  {
    month: "2025/09",
    actual: 10200,
    target: 11500,
    lastYear: 10800,
    guests: 3400,
    spend: 10200,
    store: "全店",
  },
  {
    month: "2025/10",
    actual: 10500,
    target: 12000,
    lastYear: 11200,
    guests: 3600,
    spend: 10500,
    store: "全店",
  },
  {
    month: "2025/11",
    actual: 11000,
    target: 12500,
    lastYear: 11800,
    guests: 3900,
    spend: 11000,
    store: "全店",
  },
  {
    month: "2025/12",
    actual: 11500,
    target: 13000,
    lastYear: 12000,
    guests: 4100,
    spend: 11500,
    store: "全店",
  },

  // 店舗サンプル（同じ指標でも次元が変わる想定）
  {
    month: "2025/10",
    actual: 2100,
    target: 2400,
    lastYear: 2200,
    guests: 700,
    spend: 2100,
    store: "高田馬場",
  },
  {
    month: "2025/11",
    actual: 2300,
    target: 2500,
    lastYear: 2350,
    guests: 760,
    spend: 2300,
    store: "高田馬場",
  },
  {
    month: "2025/12",
    actual: 2400,
    target: 2600,
    lastYear: 2450,
    guests: 790,
    spend: 2400,
    store: "高田馬場",
  },
];

// 表示する施策（まずは1つに絞る）
const actionTitle = "朝食単価アップ施策";

const current = {
  label: "今回（編集）",
  value: {
    situation: "現状分析中",
    issue: "単価が低い",
    action: "メニュー再設計",
    target: "単価+300円",
  },
};

function PDCAFields({ data, editable = false }) {
  const keys = ["situation", "issue", "action", "target"];
  if (!editable) return null;

  return (
    <div className="space-y-3">
      {keys.map((key) => (
        <div key={key}>
          <div className="text-xs mb-1 text-gray-500">{key}</div>
          <textarea
            className="w-full border rounded p-2 min-h-[70px]"
            defaultValue={data[key]}
          />
        </div>
      ))}
    </div>
  );
}

function CurrentEditor({ current }) {
  return (
    <div className="rounded-2xl bg-white border p-4">
      <div className="flex justify-between mb-3">
        <div>
          <div className="font-bold">{current.label}</div>
          <div className="text-xs text-gray-500">※ここだけ編集（会議中に入力）</div>
        </div>
        <div className="flex gap-2">
          <Button className="rounded-xl">保存</Button>
          <Button variant="outline" className="rounded-xl">
            Act生成
          </Button>
        </div>
      </div>
      <PDCAFields data={current.value} editable />
    </div>
  );
}

// =====================
// 2) チャート定義（DB保存される想定の設定）
// =====================

const METRICS = [
  { key: "actual", label: "実績" },
  { key: "target", label: "計画" },
  { key: "lastYear", label: "前年" },
  { key: "guests", label: "客数" },
  { key: "spend", label: "売上" },
];

const AGGS = [
  { key: "raw", label: "そのまま" },
  { key: "yoy_diff", label: "前年差" },
  { key: "yoy_pct", label: "前年比%" },
];

const STORES = ["全店", "高田馬場"];

function bySort(a, b) {
  return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
}

function computeAggRow(row, aggKey, seriesKeys) {
  if (aggKey === "raw") return row;

  const out = { ...row };
  const ly = row.lastYear;

  for (const k of seriesKeys) {
    if (k === "target") continue; // 方針は設定化

    const v = row[k];
    if (typeof v !== "number") continue;

    if (aggKey === "yoy_diff") {
      if (typeof ly === "number") out[k] = v - ly;
    }
    if (aggKey === "yoy_pct") {
      if (typeof ly === "number" && ly !== 0)
        out[k] = Math.round(((v / ly) * 100 - 100) * 10) / 10;
    }
  }

  return out;
}

function applyFiltersAndAgg(data, { store, lastN }, { aggKey, seriesKeys }) {
  const filtered = data
    .filter((r) => (store ? r.store === store : true))
    .slice(-lastN);

  return filtered.map((r) => computeAggRow(r, aggKey, seriesKeys));
}

function ChartRenderer({ config, data, globalFilters }) {
  const { type, title, xKey, seriesKeys, aggKey, store } = config;

  const resolvedFilters = {
    store: store ?? globalFilters.store,
    lastN: globalFilters.lastN,
  };

  const chartData = React.useMemo(() => {
    return applyFiltersAndAgg(data, resolvedFilters, { aggKey, seriesKeys });
  }, [
    data,
    resolvedFilters.store,
    resolvedFilters.lastN,
    aggKey,
    seriesKeys.join("|"),
  ]);

  const yLabel = AGGS.find((a) => a.key === aggKey)?.label ?? "";

  return (
    <Card className="rounded-2xl shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div>
            <div className="font-semibold">{title}</div>
            <div className="text-xs text-gray-500">
              {resolvedFilters.store} / 直近{resolvedFilters.lastN}件 / {yLabel}
            </div>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={220}>
          {type === "line" ? (
            <LineChart data={chartData}>
              <CartesianGrid />
              <XAxis dataKey={xKey} />
              <YAxis />
              <Tooltip />
              <Legend />
              {seriesKeys.map((k) => (
                <Line key={k} dataKey={k} />
              ))}
            </LineChart>
          ) : (
            <BarChart data={chartData}>
              <CartesianGrid />
              <XAxis dataKey={xKey} />
              <YAxis />
              <Tooltip />
              <Legend />
              {seriesKeys.map((k) => (
                <Bar key={k} dataKey={k} />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function ChartBuilder({ onAdd, globalFilters, onChangeGlobalFilters, nextSortOrder }) {
  const [type, setType] = React.useState("line");
  const [xKey, setXKey] = React.useState("month");
  const [title, setTitle] = React.useState("売上推移");
  const [seriesKeys, setSeriesKeys] = React.useState(["actual", "target", "lastYear"]);
  const [aggKey, setAggKey] = React.useState("raw");
  const [store, setStore] = React.useState(""); // 空 = グローバル設定に従う

  const toggleSeries = (k) => {
    setSeriesKeys((prev) =>
      prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]
    );
  };

  const add = () => {
    if (!title.trim()) return;
    if (!xKey) return;
    if (seriesKeys.length === 0) return;
    onAdd({
      id: crypto.randomUUID?.() ?? String(Date.now()),
      type,
      xKey,
      title,
      seriesKeys,
      aggKey,
      store: store || null,
      showOnDashboard: false, // まずは作って、選んだものだけ表示
      sortOrder: nextSortOrder, // 並び順（ダッシュボードでも共通で使う）
    });
  };

  return (
    <Card className="rounded-2xl shadow">
      <CardContent className="p-4 space-y-4">
        <div>
          <div className="font-semibold">グラフ作成（ピボット風）</div>
          <div className="text-xs text-gray-500">フィルタ・集計・形状を選んで作成</div>
        </div>

        {/* グローバルフィルタ（ダッシュボード全体に効く） */}
        <div className="rounded-xl border bg-white p-3">
          <div className="text-xs font-semibold text-gray-600 mb-2">全体フィルタ</div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-xs text-gray-500 mb-1">店舗</div>
              <select
                className="w-full border rounded-lg px-2 py-1 bg-white"
                value={globalFilters.store}
                onChange={(e) =>
                  onChangeGlobalFilters((p) => ({ ...p, store: e.target.value }))
                }
              >
                {STORES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">期間（直近N件）</div>
              <select
                className="w-full border rounded-lg px-2 py-1 bg-white"
                value={globalFilters.lastN}
                onChange={(e) =>
                  onChangeGlobalFilters((p) => ({
                    ...p,
                    lastN: Number(e.target.value),
                  }))
                }
              >
                {[3, 6, 12].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* グラフ設定 */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-xs text-gray-500 mb-1">形状</div>
            <select
              className="w-full border rounded-lg px-2 py-1 bg-white"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="line">折れ線</option>
              <option value="bar">棒</option>
            </select>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">集計</div>
            <select
              className="w-full border rounded-lg px-2 py-1 bg-white"
              value={aggKey}
              onChange={(e) => setAggKey(e.target.value)}
            >
              {AGGS.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-xs text-gray-500 mb-1">X軸</div>
            <select
              className="w-full border rounded-lg px-2 py-1 bg-white"
              value={xKey}
              onChange={(e) => setXKey(e.target.value)}
            >
              <option value="month">年月</option>
            </select>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">店舗（このグラフだけ）</div>
            <select
              className="w-full border rounded-lg px-2 py-1 bg-white"
              value={store}
              onChange={(e) => setStore(e.target.value)}
            >
              <option value="">全体フィルタに従う</option>
              {STORES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <div className="text-xs text-gray-500 mb-1">タイトル</div>
          <input
            className="w-full border rounded-lg px-2 py-1"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div>
          <div className="text-xs text-gray-500 mb-1">系列（表示する数値）</div>
          <div className="grid grid-cols-2 gap-2">
            {METRICS.map((m) => (
              <label
                key={m.key}
                className="flex items-center gap-2 text-sm bg-gray-50 border rounded-lg px-2 py-1"
              >
                <input
                  type="checkbox"
                  checked={seriesKeys.includes(m.key)}
                  onChange={() => toggleSeries(m.key)}
                />
                {m.label}
              </label>
            ))}
          </div>
          <div className="text-xs text-gray-500 mt-2">
            ※ 実務では、指標ごとの「使える集計（前年差OK/不可）」は設定で制御
          </div>
        </div>

        <Button className="w-full rounded-xl" onClick={add}>
          + グラフを作成
        </Button>
      </CardContent>
    </Card>
  );
}

function ChartStudio({ charts, setCharts, globalFilters, setGlobalFilters, onBack }) {
  const nextSortOrder = React.useMemo(() => {
    const max = Math.max(...charts.map((c) => c.sortOrder ?? 0), 0);
    return max + 10;
  }, [charts]);

  const add = (c) => setCharts((prev) => [c, ...prev]);
  const remove = (id) => setCharts((prev) => prev.filter((c) => c.id !== id));
  const toggleShow = (id) =>
    setCharts((prev) =>
      prev.map((c) => (c.id === id ? { ...c, showOnDashboard: !c.showOnDashboard } : c))
    );

  // --- 並び替え（ドラッグ&ドロップ） ---
  const dragIdRef = React.useRef(null);

  const onDragStart = (id) => {
    dragIdRef.current = id;
  };

  const reorder = (fromId, toId) => {
    if (!fromId || !toId || fromId === toId) return;

    setCharts((prev) => {
      const next = [...prev].sort(bySort);
      const fromIdx = next.findIndex((c) => c.id === fromId);
      const toIdx = next.findIndex((c) => c.id === toId);
      if (fromIdx < 0 || toIdx < 0) return prev;

      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);

      // 連番を振り直して安定化（DB保存時もこのsortOrderだけ保存すればOK）
      return next.map((c, i) => ({ ...c, sortOrder: (i + 1) * 10 }));
    });
  };

  const sortedCharts = React.useMemo(() => [...charts].sort(bySort), [charts]);
  const shownCount = charts.filter((c) => c.showOnDashboard).length;

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xl font-bold">グラフ作成（クライアント別）</div>
            <div className="text-sm text-gray-500">作成 → 「表示する」でダッシュボードに反映</div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="rounded-xl" onClick={onBack}>
              ← ダッシュボードに戻る（表示中 {shownCount}）
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-5 space-y-4">
            <ChartBuilder
              onAdd={add}
              globalFilters={globalFilters}
              onChangeGlobalFilters={setGlobalFilters}
              nextSortOrder={nextSortOrder}
            />

            <Card className="rounded-2xl shadow">
              <CardContent className="p-4">
                <div className="flex items-end justify-between gap-2 mb-2">
                  <div>
                    <div className="font-semibold">作成済みグラフ</div>
                    <div className="text-xs text-gray-500">ドラッグで順番変更（この順でダッシュボードにも出る）</div>
                  </div>
                  <div className="text-xs text-gray-500">件数: {charts.length}</div>
                </div>

                <div className="space-y-2">
                  {sortedCharts.map((c) => (
                    <div
                      key={c.id}
                      draggable
                      onDragStart={() => onDragStart(c.id)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => reorder(dragIdRef.current, c.id)}
                      className="flex items-center justify-between gap-2 border rounded-xl bg-white p-3 cursor-move"
                      title="ドラッグして並び替え"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="text-xs text-gray-400">≡</div>
                          <div className="font-semibold truncate">{c.title}</div>
                        </div>
                        <div className="text-xs text-gray-500 truncate ml-5">
                          {c.type === "line" ? "折れ線" : "棒"} / {AGGS.find((a) => a.key === c.aggKey)?.label} / 系列:{" "}
                          {c.seriesKeys
                            .map((k) => METRICS.find((m) => m.key === k)?.label ?? k)
                            .join("・")}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          className="rounded-lg"
                          variant={c.showOnDashboard ? "default" : "outline"}
                          onClick={() => toggleShow(c.id)}
                        >
                          {c.showOnDashboard ? "表示中" : "表示する"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-lg"
                          onClick={() => remove(c.id)}
                        >
                          削除
                        </Button>
                      </div>
                    </div>
                  ))}

                  {charts.length === 0 && (
                    <div className="text-sm text-gray-500">まだグラフがありません</div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="col-span-7 space-y-4">
            <div className="text-sm text-gray-500">プレビュー（上から3つ表示）</div>
            <div className="space-y-4">
              {sortedCharts.slice(0, 3).map((c) => (
                <ChartRenderer
                  key={c.id}
                  config={c}
                  data={monthlyData}
                  globalFilters={globalFilters}
                />
              ))}
              {charts.length === 0 && (
                <Card className="rounded-2xl shadow">
                  <CardContent className="p-6 text-gray-500">左でグラフを作成するとここにプレビューされます</CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================
// 3) ダッシュボード（表示するグラフだけ）
// =====================

function DashboardView({ charts, globalFilters, onOpenChartStudio }) {
  const visibleCharts = React.useMemo(() => {
    return [...charts].filter((c) => c.showOnDashboard).sort(bySort);
  }, [charts]);

  return (
    <div className="p-6 grid grid-cols-12 gap-6 bg-gray-50 min-h-screen">
      {/* LEFT: KPI + Charts */}
      <div className="col-span-4 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-xl font-bold">KPI</h2>
          <Button variant="outline" className="rounded-xl" onClick={onOpenChartStudio}>
            グラフ作成へ
          </Button>
        </div>

        {kpis.map((kpi, i) => {
          const percent = Math.round((kpi.actual / kpi.target) * 100);
          return (
            <Card key={i} className="rounded-2xl shadow">
              <CardContent className="p-4">
                <div className="text-sm text-gray-500">{kpi.name}</div>
                <div className="text-xl font-bold">{kpi.actual}</div>
                <div className="text-xs text-gray-500">目標: {kpi.target}</div>
                <Progress value={percent} className="mt-2" />
              </CardContent>
            </Card>
          );
        })}

        {/* 選ばれたグラフのみ表示（並び順はChart Studioで管理） */}
        <div className="space-y-4">
          {visibleCharts.map((c) => (
            <ChartRenderer
              key={c.id}
              config={c}
              data={monthlyData}
              globalFilters={globalFilters}
            />
          ))}

          {visibleCharts.length === 0 && (
            <Card className="rounded-2xl shadow">
              <CardContent className="p-4">
                <div className="font-semibold">グラフが未設定です</div>
                <div className="text-sm text-gray-500 mt-1">「グラフ作成へ」から作成して「表示する」をONにしてください</div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* RIGHT: PDCA */}
      <div className="col-span-8">
        <h2 className="text-xl font-bold mb-4">アクションプラン</h2>
        <div className="text-sm text-gray-500 mb-4">{actionTitle}</div>
        <CurrentEditor current={current} />
      </div>
    </div>
  );
}

// =====================
// 4) ルート（プロトタイプ用）
// =====================

export default function App() {
  // 実装では Next.js の routing（/clients/[id]/dashboard, /clients/[id]/charts）に分ける想定
  const [route, setRoute] = React.useState("dashboard"); // 'dashboard' | 'chartStudio'

  // グローバルフィルタ（本番ではクライアント/店舗の文脈に合わせて保持）
  const [globalFilters, setGlobalFilters] = React.useState({ store: "全店", lastN: 6 });

  // クライアント別のチャート定義（本番はDBに保存）
  const [charts, setCharts] = React.useState([
    {
      id: "c1",
      type: "line",
      title: "売上推移（実績/計画/前年）",
      xKey: "month",
      seriesKeys: ["actual", "target", "lastYear"],
      aggKey: "raw",
      store: null,
      showOnDashboard: true,
      sortOrder: 10,
    },
    {
      id: "c2",
      type: "bar",
      title: "前年比%（売上）",
      xKey: "month",
      seriesKeys: ["spend"],
      aggKey: "yoy_pct",
      store: "高田馬場",
      showOnDashboard: false,
      sortOrder: 20,
    },
  ]);

  if (route === "chartStudio") {
    return (
      <ChartStudio
        charts={charts}
        setCharts={setCharts}
        globalFilters={globalFilters}
        setGlobalFilters={setGlobalFilters}
        onBack={() => setRoute("dashboard")}
      />
    );
  }

  return (
    <DashboardView
      charts={charts}
      globalFilters={globalFilters}
      onOpenChartStudio={() => setRoute("chartStudio")}
    />
  );
}
```
