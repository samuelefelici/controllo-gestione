"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid, Legend,
  AreaChart, Area, ComposedChart, Line,
} from "recharts";

/* ═══════ Helpers ═══════ */
const fmt = (v: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
const fmt2 = (v: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(v);
const fmtPct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
const PERIOD_LABELS: Record<string, string> = {
  "01":"Gen","02":"Feb","03":"Mar","04":"Apr","05":"Mag","06":"Giu",
  "07":"Lug","08":"Ago","09":"Set","10":"Ott","11":"Nov","12":"Dic",
};
const COLORS = ["#0ea5e9","#f59e0b","#10b981","#ef4444","#8b5cf6","#ec4899","#14b8a6","#f97316","#6366f1","#84cc16","#a855f7","#fb923c"];

const periodLabel = (p: string) => {
  const [y, m] = p.split("-");
  return `${PERIOD_LABELS[m] || m} ${y}`;
};

/* ═══════ Components ═══════ */
function KPI({ label, value, sub, change, color = "text-sky-400", icon }: {
  label: string; value: string; sub?: string; change?: number | null; color?: string; icon?: string;
}) {
  return (
    <div className="bg-slate-900/80 backdrop-blur rounded-2xl p-5 border border-slate-800/60 flex-1 min-w-[200px] group hover:border-slate-700/80 transition-all">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">{label}</span>
        {icon && <span className="text-lg opacity-60">{icon}</span>}
      </div>
      <div className={`text-2xl font-bold font-mono ${color}`}>{value}</div>
      <div className="flex items-center gap-2 mt-1.5">
        {sub && <span className="text-[11px] text-slate-500">{sub}</span>}
        {change !== null && change !== undefined && (
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
            change >= 0 ? "bg-emerald-950 text-emerald-400" : "bg-red-950 text-red-400"
          }`}>
            {fmtPct(change)} vs mese prec.
          </span>
        )}
      </div>
    </div>
  );
}

function SectionTitle({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="mb-4">
      <h3 className="text-base font-bold text-white">{children}</h3>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-slate-900/80 backdrop-blur rounded-2xl border border-slate-800/60 ${className}`}>
      {children}
    </div>
  );
}

function MiniBar({ value, max, color = "#0ea5e9" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="w-20 h-1.5 bg-slate-800 rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-slate-400 font-semibold mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }} className="font-mono">{p.name}: {fmt2(p.value)}</p>
      ))}
    </div>
  );
};

/* ═══════ Main ═══════ */
export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center"><div className="animate-spin w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full" /></div>}>
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const searchParams = useSearchParams();
  const clientId = searchParams.get("client_id") || "";

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("");
  const [tab, setTab] = useState("overview");

  useEffect(() => {
    if (!clientId) return;
    const params = new URLSearchParams();
    params.set("client_id", clientId);
    if (period) params.set("period", period);
    setLoading(true);
    fetch(`/api/data?${params}`)
      .then(r => r.json())
      .then(d => { setData(d); if (!period && d.period) setPeriod(d.period); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [period, clientId]);

  // Derived data
  const salesData = useMemo(() => {
    if (!data?.sales?.data) return [];
    return data.sales.data.filter((c: any) => c.net_sales > 0).slice(0, 15);
  }, [data]);

  const salesTop5 = useMemo(() => salesData.slice(0, 5), [salesData]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="text-center">
          <div className="animate-spin w-10 h-10 border-2 border-sky-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-slate-500 text-sm">Caricamento dashboard...</p>
        </div>
      </div>
    );
  }

  if (!data || data.error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 gap-4">
        <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center text-3xl">📊</div>
        <p className="text-xl text-slate-400">Nessun dato disponibile</p>
        <p className="text-sm text-slate-600">Carica prima i file dal pannello di gestione</p>
        <Link href={`/admin/${clientId}`} className="mt-4 px-6 py-2 bg-sky-600 text-white rounded-xl text-sm font-semibold hover:bg-sky-500 transition">
          ← Vai alla Gestione
        </Link>
      </div>
    );
  }

  const sa = data.sales?.aggregates || {};
  const pa = data.payroll?.aggregates || {};
  const ba = data.bank?.aggregates || {};
  const amex = data.amex?.aggregates || {};
  const ch = data.changes || {};
  const inc = data.incidence || {};
  const comp = data.computed || {};

  const tabs = [
    { id: "overview", label: "📊 Panoramica", shortLabel: "Panoramica" },
    { id: "sales", label: "🛒 Vendite", shortLabel: "Vendite" },
    { id: "costs", label: "💸 Costi", shortLabel: "Costi" },
    { id: "payroll", label: "👥 Personale", shortLabel: "Personale" },
    { id: "cashflow", label: "🏦 Flussi", shortLabel: "Flussi" },
    { id: "pnl", label: "📋 Conto Economico", shortLabel: "P&L" },
  ];

  return (
    <div className="min-h-screen bg-slate-950">
      {/* ═══ HEADER ═══ */}
      <header className="border-b border-slate-800/60 bg-slate-900/60 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <Link href="/admin" className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center text-white font-bold text-xs shadow-lg shadow-sky-500/20">FF</Link>
              <div className="hidden sm:block">
                <h1 className="text-sm font-bold text-white leading-tight">Controllo di Gestione</h1>
                <p className="text-[10px] text-slate-500 leading-tight">{periodLabel(period)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <select
                value={period}
                onChange={e => setPeriod(e.target.value)}
                className="bg-slate-800/80 border border-slate-700/50 rounded-lg px-3 py-1.5 text-white text-xs font-mono focus:ring-2 focus:ring-sky-500/50 focus:outline-none"
              >
                {(data.available_periods || [period]).map((p: string) => (
                  <option key={p} value={p}>{periodLabel(p)}</option>
                ))}
              </select>
              <Link href={`/admin/${clientId}`} className="text-xs text-slate-500 hover:text-sky-400 transition hidden sm:block">
                ⬆ Carica file
              </Link>
            </div>
          </div>
          {/* Tab bar */}
          <div className="flex gap-0.5 -mb-px overflow-x-auto scrollbar-none">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-4 py-2.5 text-xs font-medium transition-all border-b-2 whitespace-nowrap ${
                  tab === t.id
                    ? "border-sky-500 text-white"
                    : "border-transparent text-slate-500 hover:text-slate-300"
                }`}
              >
                <span className="hidden sm:inline">{t.label}</span>
                <span className="sm:hidden">{t.shortLabel}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* ══════════════════════════════════════════════════════
            TAB: OVERVIEW
        ══════════════════════════════════════════════════════ */}
        {tab === "overview" && (
          <>
            {/* Hero KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KPI icon="🛒" label="Vendite Nette" value={fmt(sa.total_net_sales || 0)} sub={`${sa.total_qty || 0} pezzi venduti`} change={ch.sales_net} />
              <KPI icon="👥" label="Costo Personale" value={fmt(comp.total_costi_personale || 0)} sub={`${pa.employee_count || 0} dipendenti`} change={ch.payroll_gross} color="text-amber-400" />
              <KPI icon="🏦" label="Saldo C/C" value={fmt(ba.closing_balance || 0)} sub={`${ba.transaction_count || 0} movimenti`} color="text-emerald-400" />
              <KPI icon="💳" label="Spese Amex" value={fmt(amex.total_charges || 0)} sub={`${amex.count || 0} operazioni`} change={ch.amex} color="text-purple-400" />
            </div>

            {/* Charts row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Top categories */}
              {salesTop5.length > 0 && (
                <Card className="p-5">
                  <h3 className="text-sm font-semibold text-white mb-4">Top 5 Categorie Vendita</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={salesTop5} layout="vertical" margin={{ left: 80 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis type="number" tick={{ fill: "#64748b", fontSize: 10 }} tickFormatter={(v) => fmt(v)} />
                      <YAxis dataKey="category_name" type="category" tick={{ fill: "#94a3b8", fontSize: 10 }} width={75} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="net_sales" name="Vendite" fill="#0ea5e9" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              )}

              {/* Bank balance trend */}
              {data.bank?.daily_balance?.length > 0 && (
                <Card className="p-5">
                  <h3 className="text-sm font-semibold text-white mb-4">Andamento Saldo C/C</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={data.bank.daily_balance}>
                      <defs>
                        <linearGradient id="balGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 9 }} tickFormatter={(d) => d.substring(8)} />
                      <YAxis tick={{ fill: "#64748b", fontSize: 10 }} tickFormatter={(v) => fmt(v)} />
                      <Tooltip content={<CustomTooltip />} />
                      <Area type="monotone" dataKey="balance" name="Saldo" stroke="#10b981" fill="url(#balGrad)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </Card>
              )}
            </div>

            {/* Quick summary: cost composition */}
            <Card className="p-5">
              <h3 className="text-sm font-semibold text-white mb-4">Composizione Costi del Mese</h3>
              <div className="space-y-3">
                {[
                  { label: "Personale (lordo + TFR)", value: comp.total_costi_personale, color: "#f59e0b", icon: "👥" },
                  { label: "Uscite C/C Bancario", value: comp.total_spese_banca, color: "#ef4444", icon: "🏦" },
                  { label: "Addebiti Amex", value: comp.total_spese_amex, color: "#8b5cf6", icon: "💳" },
                ].map((item, i) => {
                  const total = (comp.total_costi_personale || 0) + (comp.total_spese_banca || 0) + (comp.total_spese_amex || 0);
                  const pct = total > 0 ? ((item.value || 0) / total * 100) : 0;
                  return (
                    <div key={i} className="flex items-center gap-4">
                      <span className="text-lg w-8 text-center">{item.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-slate-400">{item.label}</span>
                          <span className="text-sm font-mono font-semibold text-white">{fmt(item.value || 0)}</span>
                        </div>
                        <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: item.color }} />
                        </div>
                      </div>
                      <span className="text-xs font-mono text-slate-500 w-12 text-right">{pct.toFixed(0)}%</span>
                    </div>
                  );
                })}
              </div>
            </Card>
          </>
        )}

        {/* ══════════════════════════════════════════════════════
            TAB: VENDITE
        ══════════════════════════════════════════════════════ */}
        {tab === "sales" && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KPI icon="💰" label="Vendite Nette" value={fmt(sa.total_net_sales)} change={ch.sales_net} />
              <KPI icon="🧾" label="IVA Incassata" value={fmt(sa.total_vat)} color="text-amber-400" />
              <KPI icon="📦" label="Pezzi Venduti" value={`${sa.total_qty?.toLocaleString("it-IT") || 0}`} change={ch.sales_qty} color="text-emerald-400" />
              <KPI icon="🏷️" label="Sconti Applicati" value={fmt(sa.total_discount)} sub={`${(inc.discount_on_gross || 0).toFixed(1)}% del lordo`} color="text-red-400" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Chart */}
              {salesData.length > 0 && (
                <Card className="p-5">
                  <h3 className="text-sm font-semibold text-white mb-4">Vendite per Categoria</h3>
                  <ResponsiveContainer width="100%" height={Math.max(salesData.length * 28, 200)}>
                    <BarChart data={salesData} layout="vertical" margin={{ left: 100 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis type="number" tick={{ fill: "#64748b", fontSize: 10 }} tickFormatter={v => fmt(v)} />
                      <YAxis dataKey="category_name" type="category" tick={{ fill: "#94a3b8", fontSize: 9 }} width={95} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="net_sales" name="Netto" fill="#0ea5e9" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              )}

              {/* Pie: top 5 + rest */}
              {salesData.length > 0 && (
                <Card className="p-5">
                  <h3 className="text-sm font-semibold text-white mb-4">Distribuzione Vendite</h3>
                  {(() => {
                    const top = salesData.slice(0, 6);
                    const rest = salesData.slice(6).reduce((s: number, c: any) => s + c.net_sales, 0);
                    const pieData = [
                      ...top.map((c: any, i: number) => ({ name: c.category_name, value: c.net_sales, color: COLORS[i] })),
                      ...(rest > 0 ? [{ name: "Altro", value: rest, color: "#475569" }] : []),
                    ];
                    return (
                      <>
                        <ResponsiveContainer width="100%" height={220}>
                          <PieChart>
                            <Pie data={pieData} dataKey="value" cx="50%" cy="50%" innerRadius={50} outerRadius={90} strokeWidth={2} stroke="#020617">
                              {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                            </Pie>
                            <Tooltip content={<CustomTooltip />} />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 justify-center">
                          {pieData.map((s, i) => (
                            <div key={i} className="flex items-center gap-1.5 text-[10px]">
                              <div className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                              <span className="text-slate-500">{s.name}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    );
                  })()}
                </Card>
              )}
            </div>

            {/* Full table */}
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-xs text-slate-500 bg-slate-800/40">
                      <th className="text-left p-3 font-medium">#</th>
                      <th className="text-left p-3 font-medium">Categoria</th>
                      <th className="text-right p-3 font-medium">Qtà</th>
                      <th className="text-right p-3 font-medium">Netto</th>
                      <th className="text-right p-3 font-medium">IVA</th>
                      <th className="text-right p-3 font-medium">Totale</th>
                      <th className="text-right p-3 font-medium">Sconto</th>
                      <th className="text-right p-3 font-medium">% su Tot.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.sales?.data || []).map((c: any, i: number) => (
                      <tr key={i} className="border-b border-slate-800/30 hover:bg-slate-800/20 transition">
                        <td className="p-3 text-slate-600 font-mono text-xs">{i + 1}</td>
                        <td className="p-3 font-medium text-white text-xs">{c.category_name}</td>
                        <td className="p-3 text-right font-mono text-slate-400">{c.sold_quantity}</td>
                        <td className="p-3 text-right font-mono text-sky-400">{fmt2(c.net_sales)}</td>
                        <td className="p-3 text-right font-mono text-slate-500">{fmt2(c.vat_amount)}</td>
                        <td className="p-3 text-right font-mono text-white">{fmt2(c.sales_with_vat)}</td>
                        <td className="p-3 text-right font-mono text-amber-400">{c.net_discount > 0 ? fmt2(c.net_discount) : "—"}</td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <MiniBar value={c.net_sales} max={sa.total_net_sales} />
                            <span className="text-xs font-mono text-slate-500 w-10 text-right">
                              {sa.total_net_sales > 0 ? ((c.net_sales / sa.total_net_sales) * 100).toFixed(1) : 0}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-800/50 font-semibold text-xs">
                      <td colSpan={2} className="p-3 text-white">TOTALE</td>
                      <td className="p-3 text-right font-mono text-white">{sa.total_qty}</td>
                      <td className="p-3 text-right font-mono text-sky-400">{fmt2(sa.total_net_sales)}</td>
                      <td className="p-3 text-right font-mono text-slate-400">{fmt2(sa.total_vat)}</td>
                      <td className="p-3 text-right font-mono text-white">{fmt2(sa.total_with_vat)}</td>
                      <td className="p-3 text-right font-mono text-amber-400">{fmt2(sa.total_discount)}</td>
                      <td className="p-3 text-right font-mono text-slate-500">100%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Card>
          </>
        )}

        {/* ══════════════════════════════════════════════════════
            TAB: COSTI
        ══════════════════════════════════════════════════════ */}
        {tab === "costs" && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KPI icon="👥" label="Personale" value={fmt(comp.total_costi_personale || 0)} sub={`${(inc.staff_on_sales || 0).toFixed(1)}% del fatturato`} color="text-amber-400" />
              <KPI icon="🏦" label="Uscite Banca" value={fmt(comp.total_spese_banca || 0)} change={ch.bank_out} color="text-red-400" />
              <KPI icon="💳" label="Addebiti Amex" value={fmt(comp.total_spese_amex || 0)} change={ch.amex} color="text-purple-400" />
              <KPI icon="📊" label="Costi Totali" value={fmt((comp.total_costi_personale || 0) + (comp.total_spese_banca || 0) + (comp.total_spese_amex || 0))} color="text-red-500" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Bank outflows breakdown */}
              {data.bank?.cost_breakdown?.length > 0 && (
                <Card className="p-5">
                  <h3 className="text-sm font-semibold text-white mb-4">Dettaglio Uscite C/C</h3>
                  <div className="space-y-2.5">
                    {data.bank.cost_breakdown.slice(0, 12).map((item: any, i: number) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                        <span className="text-xs text-slate-400 flex-1 truncate">{item.name}</span>
                        <span className="text-xs font-mono font-semibold text-red-400">{fmt(item.value)}</span>
                        <MiniBar value={item.value} max={data.bank.cost_breakdown[0]?.value || 1} color={COLORS[i % COLORS.length]} />
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* Amex breakdown */}
              {data.amex?.by_category?.length > 0 && (
                <Card className="p-5">
                  <h3 className="text-sm font-semibold text-white mb-4">Addebiti Amex per Categoria</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={data.amex.by_category.map((c: any, i: number) => ({ ...c, color: COLORS[i % COLORS.length] }))} dataKey="value" cx="50%" cy="50%" innerRadius={45} outerRadius={85} strokeWidth={2} stroke="#020617">
                        {data.amex.by_category.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 justify-center">
                    {data.amex.by_category.map((c: any, i: number) => (
                      <div key={i} className="flex items-center gap-1 text-[10px]">
                        <div className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                        <span className="text-slate-500">{c.name}</span>
                        <span className="font-mono text-slate-400">{fmt(c.value)}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </div>

            {/* Amex transaction list */}
            {data.amex?.transactions?.length > 0 && (
              <Card className="overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-800/60 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">Dettaglio Operazioni Amex</h3>
                  <span className="text-xs text-slate-500 font-mono">{amex.count} operazioni</span>
                </div>
                <div className="max-h-[400px] overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-slate-900">
                      <tr className="border-b border-slate-800 text-slate-500">
                        <th className="text-left p-3 font-medium">Data</th>
                        <th className="text-left p-3 font-medium">Descrizione</th>
                        <th className="text-left p-3 font-medium">Categoria</th>
                        <th className="text-right p-3 font-medium">Importo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.amex.transactions.map((tx: any, i: number) => (
                        <tr key={i} className="border-b border-slate-800/20 hover:bg-slate-800/20">
                          <td className="p-3 font-mono text-slate-500 whitespace-nowrap">{tx.operation_date}</td>
                          <td className="p-3 text-slate-300 max-w-[250px] truncate">{tx.description}</td>
                          <td className="p-3"><span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 text-[10px]">{tx.category}</span></td>
                          <td className={`p-3 text-right font-mono font-semibold ${tx.amount_eur > 0 ? "text-red-400" : "text-emerald-400"}`}>{fmt2(tx.amount_eur)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </>
        )}

        {/* ══════════════════════════════════════════════════════
            TAB: PERSONALE
        ══════════════════════════════════════════════════════ */}
        {tab === "payroll" && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <KPI icon="💰" label="Lordo Totale" value={fmt2(pa.total_gross)} color="text-red-400" />
              <KPI icon="🏦" label="Netto Totale" value={fmt2(pa.total_net)} color="text-emerald-400" />
              <KPI icon="🏛️" label="Contributi" value={fmt2(pa.total_contributions)} color="text-amber-400" />
              <KPI icon="📋" label="IRPEF" value={fmt2(pa.total_irpef)} color="text-orange-400" />
              <KPI icon="🏦" label="TFR Mese" value={fmt2(pa.total_tfr)} color="text-purple-400" />
            </div>

            {/* Avg card */}
            <Card className="p-5">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div className="text-center">
                  <div className="text-2xl font-bold font-mono text-white">{pa.employee_count}</div>
                  <div className="text-[10px] text-slate-500 mt-1">Dipendenti</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold font-mono text-sky-400">{fmt(pa.avg_gross)}</div>
                  <div className="text-[10px] text-slate-500 mt-1">RAL Media</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold font-mono text-emerald-400">{fmt(pa.avg_net)}</div>
                  <div className="text-[10px] text-slate-500 mt-1">Netto Medio</div>
                </div>
                <div className="text-center">
                  <div className={`text-2xl font-bold font-mono ${(inc.staff_on_sales || 0) > 50 ? "text-red-400" : "text-amber-400"}`}>
                    {(inc.staff_on_sales || 0).toFixed(1)}%
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">Incidenza su Fatturato</div>
                </div>
              </div>
            </Card>

            {/* Employee cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(data.payroll?.data || []).map((p: any, i: number) => (
                <Card key={i} className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h4 className="font-semibold text-white text-sm">{p.employee_name}</h4>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        {p.role || "—"} {p.part_time_pct && p.part_time_pct < 100 ? `• PT ${p.part_time_pct}%` : ""}
                        {p.hours_worked ? ` • ${p.hours_worked}h` : ""}
                        {p.days_worked ? ` • ${p.days_worked}gg` : ""}
                      </p>
                    </div>
                    <span className="text-xs font-mono text-slate-600">#{p.employee_code}</span>
                  </div>
                  <div className="grid grid-cols-5 gap-2">
                    {[
                      { l: "Lordo", v: p.gross_pay, c: "text-white" },
                      { l: "Contributi", v: p.social_contributions, c: "text-amber-400" },
                      { l: "IRPEF", v: p.irpef, c: "text-orange-400" },
                      { l: "TFR", v: p.tfr_month, c: "text-purple-400" },
                      { l: "Netto", v: p.net_pay, c: "text-emerald-400" },
                    ].map((item, j) => (
                      <div key={j} className="text-center">
                        <div className="text-[9px] text-slate-600 mb-0.5">{item.l}</div>
                        <div className={`text-xs font-mono font-semibold ${item.c}`}>{fmt2(item.v || 0)}</div>
                      </div>
                    ))}
                  </div>
                  {/* Visual bar: gross → net */}
                  <div className="mt-3 flex gap-0.5 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-emerald-500" style={{ width: `${p.gross_pay > 0 ? (p.net_pay / p.gross_pay * 100) : 0}%` }} title="Netto" />
                    <div className="bg-amber-500" style={{ width: `${p.gross_pay > 0 ? (p.social_contributions / p.gross_pay * 100) : 0}%` }} title="Contributi" />
                    <div className="bg-orange-500" style={{ width: `${p.gross_pay > 0 ? (p.irpef / p.gross_pay * 100) : 0}%` }} title="IRPEF" />
                    <div className="bg-slate-700 flex-1" />
                  </div>
                </Card>
              ))}
            </div>

            {/* Payroll composition chart */}
            {(data.payroll?.data || []).length > 0 && (
              <Card className="p-5">
                <h3 className="text-sm font-semibold text-white mb-4">Composizione Costo per Dipendente</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={(data.payroll?.data || []).map((p: any) => ({
                    name: p.employee_name?.split(" ").pop() || "",
                    Netto: p.net_pay,
                    Contributi: p.social_contributions,
                    IRPEF: p.irpef,
                    TFR: p.tfr_month,
                  }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                    <YAxis tick={{ fill: "#64748b", fontSize: 10 }} tickFormatter={v => fmt(v)} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Bar dataKey="Netto" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="Contributi" stackId="a" fill="#f59e0b" />
                    <Bar dataKey="IRPEF" stackId="a" fill="#f97316" />
                    <Bar dataKey="TFR" stackId="a" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            )}
          </>
        )}

        {/* ══════════════════════════════════════════════════════
            TAB: FLUSSI FINANZIARI
        ══════════════════════════════════════════════════════ */}
        {tab === "cashflow" && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KPI icon="📥" label="Entrate C/C" value={fmt(ba.total_in || 0)} change={ch.bank_in} color="text-emerald-400" />
              <KPI icon="📤" label="Uscite C/C" value={fmt(ba.total_out || 0)} change={ch.bank_out} color="text-red-400" />
              <KPI icon="🏦" label="Saldo Iniziale" value={fmt(ba.opening_balance || 0)} color="text-slate-400" />
              <KPI icon="🏦" label="Saldo Finale" value={fmt(ba.closing_balance || 0)} color="text-emerald-400" />
            </div>

            {/* Balance chart */}
            {data.bank?.daily_balance?.length > 0 && (
              <Card className="p-5">
                <h3 className="text-sm font-semibold text-white mb-4">Andamento Saldo Giornaliero</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={data.bank.daily_balance}>
                    <defs>
                      <linearGradient id="balGrad2" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 9 }} tickFormatter={d => d.substring(8)} />
                    <YAxis tick={{ fill: "#64748b", fontSize: 10 }} tickFormatter={v => fmt(v)} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Area type="monotone" dataKey="balance" name="Saldo" stroke="#10b981" fill="url(#balGrad2)" strokeWidth={2} />
                    <Bar dataKey="inflow" name="Entrate" fill="#10b981" opacity={0.6} barSize={6} />
                    <Bar dataKey="outflow" name="Uscite" fill="#ef4444" opacity={0.6} barSize={6} />
                  </ComposedChart>
                </ResponsiveContainer>
              </Card>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Income breakdown */}
              {data.bank?.income_breakdown?.length > 0 && (
                <Card className="p-5">
                  <h3 className="text-sm font-semibold text-emerald-400 mb-3">📥 Entrate per Causale</h3>
                  <div className="space-y-2">
                    {data.bank.income_breakdown.slice(0, 10).map((item: any, i: number) => (
                      <div key={i} className="flex items-center justify-between">
                        <span className="text-xs text-slate-400 truncate flex-1">{item.name}</span>
                        <span className="text-xs font-mono text-emerald-400 ml-3">{fmt(item.value)}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* Cost breakdown */}
              {data.bank?.cost_breakdown?.length > 0 && (
                <Card className="p-5">
                  <h3 className="text-sm font-semibold text-red-400 mb-3">📤 Uscite per Causale</h3>
                  <div className="space-y-2">
                    {data.bank.cost_breakdown.slice(0, 10).map((item: any, i: number) => (
                      <div key={i} className="flex items-center justify-between">
                        <span className="text-xs text-slate-400 truncate flex-1">{item.name}</span>
                        <span className="text-xs font-mono text-red-400 ml-3">{fmt(item.value)}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </div>

            {/* Full transaction list */}
            <Card className="overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-800/60 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Movimenti C/C</h3>
                <span className="text-xs text-slate-500 font-mono">{ba.transaction_count} movimenti</span>
              </div>
              <div className="max-h-[500px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-900 z-10">
                    <tr className="border-b border-slate-700 text-slate-500">
                      <th className="text-left p-3 font-medium">Data</th>
                      <th className="text-left p-3 font-medium">Descrizione</th>
                      <th className="text-left p-3 font-medium">Causale</th>
                      <th className="text-right p-3 font-medium">Importo</th>
                      <th className="text-right p-3 font-medium">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.bank?.transactions || []).map((tx: any, i: number) => (
                      <tr key={i} className="border-b border-slate-800/20 hover:bg-slate-800/20 transition">
                        <td className="p-3 font-mono text-slate-500 whitespace-nowrap">{tx.transaction_date}</td>
                        <td className="p-3 text-slate-300 max-w-[250px] truncate">{tx.counterpart || tx.description?.substring(0, 80)}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                            tx.amount > 0 ? "bg-emerald-950 text-emerald-400" : "bg-red-950 text-red-400"
                          }`}>
                            {tx.subcategory || tx.category}
                          </span>
                        </td>
                        <td className={`p-3 text-right font-mono font-semibold ${tx.amount > 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {tx.amount > 0 ? "+" : ""}{fmt2(tx.amount)}
                        </td>
                        <td className="p-3 text-right font-mono text-slate-500">{fmt2(tx.running_balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}

        {/* ══════════════════════════════════════════════════════
            TAB: CONTO ECONOMICO (P&L)
        ══════════════════════════════════════════════════════ */}
        {tab === "pnl" && (
          <>
            <SectionTitle sub="Riepilogo mensile ricavi, costi e margine operativo">
              Conto Economico — {periodLabel(period)}
            </SectionTitle>

            <Card className="overflow-hidden">
              {/* RICAVI */}
              <div className="bg-emerald-950/30 px-5 py-3 border-b border-slate-800/60">
                <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Ricavi</h3>
              </div>

              {/* Vendite POS */}
              <div className="flex justify-between px-5 py-3 border-b border-slate-800/30 text-sm hover:bg-slate-800/10 transition">
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">🛒</span>
                  <span className="text-slate-300">Vendite Nette POS</span>
                </div>
                <span className="font-mono font-semibold text-emerald-400">{fmt2(sa.total_net_sales || 0)}</span>
              </div>
              <div className="flex justify-between px-5 py-2 border-b border-slate-800/30 text-xs hover:bg-slate-800/10 transition pl-12">
                <span className="text-slate-500">IVA incassata</span>
                <span className="font-mono text-slate-500">{fmt2(sa.total_vat || 0)}</span>
              </div>

              {/* Entrate bancarie non-POS */}
              {data.bank?.income_breakdown?.filter((b: any) => b.name !== "INCASSO").length > 0 && (
                <>
                  {data.bank.income_breakdown.filter((b: any) => b.name !== "INCASSO").map((item: any, i: number) => (
                    <div key={i} className="flex justify-between px-5 py-3 border-b border-slate-800/30 text-sm hover:bg-slate-800/10 transition">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500">🏦</span>
                        <span className="text-slate-300">{item.name}</span>
                      </div>
                      <span className="font-mono font-semibold text-emerald-400">{fmt2(item.value)}</span>
                    </div>
                  ))}
                </>
              )}

              {/* Revenue lines */}
              {(data.revenues || []).map((r: any, i: number) => (
                <div key={i} className="flex justify-between px-5 py-3 border-b border-slate-800/30 text-sm hover:bg-slate-800/10 transition">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500">💰</span>
                    <span className="text-slate-300 capitalize">{r.source?.replace(/_/g, " ")}</span>
                    {r.notes && <span className="text-slate-600 text-xs">({r.notes})</span>}
                  </div>
                  <span className="font-mono font-semibold text-emerald-400">{fmt2(r.amount)}</span>
                </div>
              ))}

              {/* Total ricavi */}
              <div className="flex justify-between px-5 py-3 bg-emerald-950/20 font-bold text-sm border-b border-slate-800/60">
                <span className="text-emerald-400">TOTALE RICAVI</span>
                <span className="font-mono text-emerald-400">
                  {fmt2(
                    (sa.total_net_sales || 0) +
                    (data.bank?.income_breakdown || []).filter((b: any) => b.name !== "INCASSO").reduce((s: number, b: any) => s + b.value, 0) +
                    (data.revenues || []).reduce((s: number, r: any) => s + r.amount, 0)
                  )}
                </span>
              </div>

              {/* COSTI */}
              <div className="bg-red-950/30 px-5 py-3 border-b border-slate-800/60">
                <h3 className="text-xs font-bold text-red-400 uppercase tracking-wider">Costi</h3>
              </div>

              {/* Personale */}
              <div className="flex justify-between px-5 py-3 border-b border-slate-800/30 text-sm hover:bg-slate-800/10 transition">
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">👥</span>
                  <span className="text-slate-300">Costo del Personale (Lordo)</span>
                  <span className="text-[10px] text-slate-600">{pa.employee_count} dip.</span>
                </div>
                <span className="font-mono font-semibold text-red-400">-{fmt2(pa.total_gross || 0)}</span>
              </div>
              <div className="flex justify-between px-5 py-2 border-b border-slate-800/30 text-xs hover:bg-slate-800/10 transition pl-12">
                <span className="text-slate-500">TFR accantonato</span>
                <span className="font-mono text-red-400">-{fmt2(pa.total_tfr || 0)}</span>
              </div>

              {/* Uscite banca */}
              {data.bank?.cost_breakdown?.slice(0, 8).map((item: any, i: number) => (
                <div key={i} className="flex justify-between px-5 py-3 border-b border-slate-800/30 text-sm hover:bg-slate-800/10 transition">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500">🏦</span>
                    <span className="text-slate-300">{item.name}</span>
                  </div>
                  <span className="font-mono font-semibold text-red-400">-{fmt2(item.value)}</span>
                </div>
              ))}

              {/* Amex */}
              {amex.total_charges > 0 && (
                <div className="flex justify-between px-5 py-3 border-b border-slate-800/30 text-sm hover:bg-slate-800/10 transition">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500">💳</span>
                    <span className="text-slate-300">Addebiti American Express</span>
                    <span className="text-[10px] text-slate-600">{amex.count} op.</span>
                  </div>
                  <span className="font-mono font-semibold text-red-400">-{fmt2(amex.total_charges)}</span>
                </div>
              )}

              {/* Expense lines */}
              {(data.expenses || []).map((e: any, i: number) => (
                <div key={i} className="flex justify-between px-5 py-3 border-b border-slate-800/30 text-sm hover:bg-slate-800/10 transition">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500">📋</span>
                    <span className="text-slate-300 capitalize">{e.category?.replace(/_/g, " ")}</span>
                    {e.notes && <span className="text-slate-600 text-xs">({e.notes})</span>}
                  </div>
                  <span className="font-mono font-semibold text-red-400">-{fmt2(e.amount)}</span>
                </div>
              ))}

              {/* Total costi */}
              {(() => {
                const totCosti = (comp.total_costi_personale || 0) + (comp.total_spese_banca || 0) + (comp.total_spese_amex || 0) + (data.expenses || []).reduce((s: number, e: any) => s + e.amount, 0);
                const totRicavi = (sa.total_net_sales || 0) + (data.bank?.income_breakdown || []).filter((b: any) => b.name !== "INCASSO").reduce((s: number, b: any) => s + b.value, 0) + (data.revenues || []).reduce((s: number, r: any) => s + r.amount, 0);
                const margine = totRicavi - totCosti;
                return (
                  <>
                    <div className="flex justify-between px-5 py-3 bg-red-950/20 font-bold text-sm border-b border-slate-800/60">
                      <span className="text-red-400">TOTALE COSTI</span>
                      <span className="font-mono text-red-400">-{fmt2(totCosti)}</span>
                    </div>

                    {/* MARGINE */}
                    <div className={`flex justify-between px-5 py-5 font-bold text-lg ${margine >= 0 ? "bg-emerald-950/30" : "bg-red-950/40"}`}>
                      <div>
                        <span className={margine >= 0 ? "text-emerald-300" : "text-red-300"}>MARGINE OPERATIVO</span>
                        {totRicavi > 0 && (
                          <span className="text-xs text-slate-500 ml-2">({(margine / totRicavi * 100).toFixed(1)}% dei ricavi)</span>
                        )}
                      </div>
                      <span className={`font-mono ${margine >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                        {margine >= 0 ? "+" : ""}{fmt2(margine)}
                      </span>
                    </div>
                  </>
                );
              })()}
            </Card>

            {/* Trend chart */}
            {data.trends?.monthly?.length > 1 && (
              <Card className="p-5">
                <h3 className="text-sm font-semibold text-white mb-4">Trend Mensile</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={data.trends.monthly.map((m: any) => ({
                    period: `${PERIOD_LABELS[String(m.month).padStart(2, "0")] || m.month} ${String(m.year).slice(2)}`,
                    Ricavi: m.total_revenue,
                    Costi: m.total_expenses,
                    Margine: m.net_profit,
                  }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="period" tick={{ fill: "#64748b", fontSize: 10 }} />
                    <YAxis tick={{ fill: "#64748b", fontSize: 10 }} tickFormatter={v => fmt(v)} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Bar dataKey="Ricavi" fill="#10b981" opacity={0.5} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Costi" fill="#ef4444" opacity={0.5} radius={[4, 4, 0, 0]} />
                    <Line type="monotone" dataKey="Margine" stroke="#0ea5e9" strokeWidth={3} dot={{ r: 4 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </Card>
            )}

            {/* Notes */}
            {data.summary?.notes && (
              <Card className="p-5 border-indigo-800/50 bg-indigo-950/20">
                <p className="text-xs text-indigo-300"><strong>Note:</strong> {data.summary.notes}</p>
              </Card>
            )}
          </>
        )}

      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/60 mt-8">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between text-[10px] text-slate-600">
          <span>FF Group — Controllo di Gestione</span>
          <span>Dati aggiornati al {new Date().toLocaleDateString("it-IT")}</span>
        </div>
      </footer>
    </div>
  );
}
