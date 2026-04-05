"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, CartesianGrid, Legend,
  AreaChart, Area, ComposedChart,
} from "recharts";

const fmt = (v: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
const fmt2 = (v: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(v);
const PERIOD_LABELS: Record<string, string> = { "01": "Gen", "02": "Feb", "03": "Mar", "04": "Apr", "05": "Mag", "06": "Giu", "07": "Lug", "08": "Ago", "09": "Set", "10": "Ott", "11": "Nov", "12": "Dic" };
const COLORS = ["#0ea5e9", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#84cc16"];

function KPI({ label, value, sub, color = "#0ea5e9" }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-slate-900 rounded-xl p-5 border border-slate-800 flex-1 min-w-[180px]">
      <div className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold mb-2">{label}</div>
      <div className="text-2xl font-bold font-mono" style={{ color }}>{value}</div>
      {sub && <div className="text-[11px] text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs">
      <p className="text-slate-400 font-semibold mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }}>{p.name}: {fmt2(p.value)}</p>
      ))}
    </div>
  );
};

export default function DashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("");
  const [tab, setTab] = useState("overview");

  useEffect(() => {
    const url = period ? `/api/data?period=${period}` : "/api/data";
    setLoading(true);
    fetch(url)
      .then((r) => r.json())
      .then((d) => { setData(d); if (!period && d.period) setPeriod(d.period); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [period]);

  const salesData = useMemo(() => {
    if (!data?.sales?.data) return [];
    return data.sales.data
      .filter((c: any) => c.category_name !== "MONEY TRANSFER")
      .slice(0, 15);
  }, [data]);

  const bankSummary = useMemo(() => {
    if (!data?.bank?.transactions) return [];
    const cats: Record<string, number> = {};
    for (const tx of data.bank.transactions) {
      const key = tx.subcategory || tx.category;
      cats[key] = (cats[key] || 0) + Math.abs(tx.amount);
    }
    return Object.entries(cats)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [data]);

  const revenuePie = useMemo(() => {
    if (!data?.revenues) return [];
    const revenueNameMap: Record<string, string> = {
      wu: "Western Union",
      ria: "RIA",
      mg: "MoneyGram",
      prodotti: "Prodotti",
      ticket: "Biglietteria",
      riparazioni: "Riparazioni",
    };

    return data.revenues.map((r: any, i: number) => ({
      name: revenueNameMap[r.source] || r.source,
      value: r.amount,
      color: COLORS[i % COLORS.length],
    }));
  }, [data]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-slate-500 text-sm">Caricamento dati...</p>
        </div>
      </div>
    );
  }

  if (!data || data.error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="text-center">
          <p className="text-xl text-slate-400 mb-4">Nessun dato disponibile</p>
          <Link href="/" className="text-sky-500 hover:text-sky-400 text-sm">← Torna all&apos;upload</Link>
        </div>
      </div>
    );
  }

  const sa = data.sales?.aggregates || {};
  const pa = data.payroll?.aggregates || {};
  const ba = data.bank?.aggregates || {};
  const tabs = [
    { id: "overview", label: "Panoramica" },
    { id: "sales", label: "Vendite" },
    { id: "expenses", label: "Spese" },
    { id: "payroll", label: "Personale" },
    { id: "bank", label: "Banca" },
    { id: "profit", label: "Profitto" },
  ];

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="w-9 h-9 rounded-lg bg-gradient-to-br from-sky-500 to-indigo-500 flex items-center justify-center text-white font-bold text-sm">SW</Link>
            <div>
              <h1 className="text-lg font-bold text-white">Dashboard</h1>
              <p className="text-[10px] text-slate-500">Smart World SRLS</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-sm font-mono"
            >
              {(data.available_periods || [period]).map((p: string) => (
                <option key={p} value={p}>
                  {PERIOD_LABELS[p.split("-")[1]] || p.split("-")[1]} {p.split("-")[0]}
                </option>
              ))}
            </select>
            <Link href="/" className="text-xs text-slate-500 hover:text-sky-400">+ Carica file</Link>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-6 flex gap-1 pb-2 overflow-x-auto">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === t.id ? "bg-sky-600 text-white" : "text-slate-500 hover:text-slate-300"}`}>
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        {/* ── OVERVIEW ── */}
        {tab === "overview" && (
          <>
            <div className="flex gap-4 flex-wrap mb-6">
              <KPI label="Fatturato Netto" value={fmt(sa.total_net_sales || 0)} sub={`${sa.total_qty || 0} articoli venduti`} />
              <KPI label="Costo Personale" value={fmt(pa.total_gross + pa.total_tfr || 0)} sub={`${pa.employee_count || 0} dipendenti`} color="#f59e0b" />
              <KPI label="Saldo Banca" value={fmt(ba.closing_balance || 0)} sub={`${ba.transaction_count || 0} movimenti`} color="#10b981" />
              <KPI label="Incassi POS" value={fmt(ba.total_pos_income || 0)} sub="Negozio fisico" color="#8b5cf6" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
              {/* Sales chart */}
              <div className="bg-slate-900 rounded-xl p-5 border border-slate-800">
                <h3 className="text-sm font-semibold text-white mb-4">Top Categorie Vendita</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={salesData} layout="vertical" margin={{ left: 100 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis type="number" tick={{ fill: "#64748b", fontSize: 10 }} />
                    <YAxis dataKey="category_name" type="category" tick={{ fill: "#94a3b8", fontSize: 10 }} width={95} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="net_sales" name="Vendite Nette" fill="#0ea5e9" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Revenue pie */}
              {revenuePie.length > 0 && (
                <div className="bg-slate-900 rounded-xl p-5 border border-slate-800">
                  <h3 className="text-sm font-semibold text-white mb-4">Fonti di Ricavo (da Banca)</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie data={revenuePie} dataKey="value" cx="50%" cy="50%" outerRadius={100} strokeWidth={2} stroke="#020617">
                        {revenuePie.map((e: any, i: number) => <Cell key={i} fill={e.color} />)}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                    {revenuePie.map((s: any, i: number) => (
                      <div key={i} className="flex items-center gap-1.5 text-[10px]">
                        <div className="w-2 h-2 rounded-sm" style={{ background: s.color }} />
                        <span className="text-slate-500">{s.name}</span>
                        <span className="font-mono font-semibold text-slate-300">{fmt(s.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Recent uploads */}
            {data.uploads?.length > 0 && (
              <div className="bg-slate-900 rounded-xl p-5 border border-slate-800">
                <h3 className="text-sm font-semibold text-white mb-3">Ultimi File Caricati</h3>
                <div className="space-y-2">
                  {data.uploads.slice(0, 8).map((u: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-xs py-2 border-b border-slate-800 last:border-0">
                      <div className="flex items-center gap-3">
                        <span className={`w-2 h-2 rounded-full ${u.status === "parsed" ? "bg-emerald-500" : u.status === "error" ? "bg-red-500" : "bg-yellow-500"}`} />
                        <span className="text-slate-300 font-medium">{u.filename}</span>
                        <span className="text-slate-600">{u.file_type}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-slate-500 font-mono">{u.period}</span>
                        <span className="text-slate-600">{u.rows_imported} righe</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── SALES ── */}
        {tab === "sales" && data.sales?.data && (
          <>
            <div className="flex gap-4 flex-wrap mb-6">
              <KPI label="Vendite Nette" value={fmt(sa.total_net_sales)} />
              <KPI label="IVA" value={fmt(sa.total_vat)} color="#f59e0b" />
              <KPI label="Totale con IVA" value={fmt(sa.total_with_vat)} color="#10b981" />
              <KPI label="Sconti" value={fmt(sa.total_discount)} color="#ef4444" />
            </div>
            <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-xs text-slate-500">
                    <th className="text-left p-3 font-medium">Categoria</th>
                    <th className="text-right p-3 font-medium">Qtà</th>
                    <th className="text-right p-3 font-medium">Netto</th>
                    <th className="text-right p-3 font-medium">IVA</th>
                    <th className="text-right p-3 font-medium">Totale</th>
                    <th className="text-right p-3 font-medium">Sconto</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sales.data.map((c: any, i: number) => (
                    <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                      <td className="p-3 font-medium text-white">{c.category_name}</td>
                      <td className="p-3 text-right font-mono text-slate-400">{c.sold_quantity}</td>
                      <td className="p-3 text-right font-mono text-sky-400">{fmt2(c.net_sales)}</td>
                      <td className="p-3 text-right font-mono text-slate-500">{fmt2(c.vat_amount)}</td>
                      <td className="p-3 text-right font-mono text-white">{fmt2(c.sales_with_vat)}</td>
                      <td className="p-3 text-right font-mono text-amber-400">{c.net_discount > 0 ? fmt2(c.net_discount) : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ── PAYROLL ── */}
        {tab === "payroll" && data.payroll?.data && (
          <>
            <div className="flex gap-4 flex-wrap mb-6">
              <KPI label="Lordo Totale" value={fmt2(pa.total_gross)} color="#ef4444" />
              <KPI label="Netto Totale" value={fmt2(pa.total_net)} color="#0ea5e9" />
              <KPI label="Contributi" value={fmt2(pa.total_contributions)} color="#f59e0b" />
              <KPI label="TFR Mese" value={fmt2(pa.total_tfr)} color="#8b5cf6" />
            </div>
            <div className="space-y-4">
              {data.payroll.data.map((p: any, i: number) => (
                <div key={i} className="bg-slate-900 rounded-xl p-5 border border-slate-800 flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <h3 className="font-semibold text-white">{p.employee_name}</h3>
                    <p className="text-xs text-slate-500">{p.role} • {p.part_time_pct}%</p>
                  </div>
                  <div className="flex gap-6">
                    {[
                      { l: "Lordo", v: p.gross_pay, c: "text-slate-400" },
                      { l: "Contributi", v: p.social_contributions, c: "text-amber-400" },
                      { l: "IRPEF", v: p.irpef, c: "text-red-400" },
                      { l: "TFR", v: p.tfr_month, c: "text-purple-400" },
                      { l: "Netto", v: p.net_pay, c: "text-emerald-400" },
                    ].map((item, j) => (
                      <div key={j} className="text-center">
                        <div className="text-[10px] text-slate-600">{item.l}</div>
                        <div className={`text-sm font-mono font-semibold ${item.c}`}>{fmt2(item.v)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── BANK ── */}
        {tab === "bank" && (
          <>
            <div className="flex gap-4 flex-wrap mb-6">
              <KPI label="Incassi POS" value={fmt(ba.total_pos_income)} color="#10b981" />
              <KPI label="Uscite POS" value={fmt(ba.total_pos_expense)} color="#ef4444" />
              <KPI label="Bonifici In" value={fmt(ba.total_bonifici_in)} color="#0ea5e9" />
              <KPI label="Bonifici Out" value={fmt(ba.total_bonifici_out)} color="#f59e0b" />
            </div>
            <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
              <div className="max-h-[600px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-900">
                    <tr className="border-b border-slate-700 text-slate-500">
                      <th className="text-left p-3 font-medium">Data</th>
                      <th className="text-left p-3 font-medium">Descrizione</th>
                      <th className="text-left p-3 font-medium">Categoria</th>
                      <th className="text-right p-3 font-medium">Importo</th>
                      <th className="text-right p-3 font-medium">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.bank?.transactions || []).map((tx: any, i: number) => (
                      <tr key={i} className="border-b border-slate-800/30 hover:bg-slate-800/20">
                        <td className="p-3 font-mono text-slate-500 whitespace-nowrap">{tx.transaction_date}</td>
                        <td className="p-3 text-slate-300 max-w-[300px] truncate">{tx.counterpart || tx.description?.substring(0, 60)}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                            tx.amount > 0 ? "bg-emerald-950 text-emerald-400" : "bg-red-950 text-red-400"
                          }`}>
                            {tx.subcategory}
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
            </div>
          </>
        )}

        {/* ── EXPENSES ── */}
        {tab === "expenses" && (
          <>
            <div className="flex gap-4 flex-wrap mb-6">
              <KPI label="Spese Banca Totali" value={fmt(ba.total_pos_expense + ba.total_bonifici_out + ba.total_commissions + ba.total_sdd)} color="#ef4444" />
              <KPI label="Amex" value={fmt(data.amex?.reduce((s: number, t: any) => s + t.amount_eur, 0) || 0)} color="#f59e0b" />
            </div>
            {data.amex?.length > 0 && (
              <div className="bg-slate-900 rounded-xl border border-slate-800 p-5 mb-6">
                <h3 className="text-sm font-semibold text-white mb-3">Estratto Amex</h3>
                <div className="space-y-2">
                  {data.amex.map((tx: any, i: number) => (
                    <div key={i} className="flex justify-between items-center py-2 border-b border-slate-800/50 text-xs last:border-0">
                      <div className="flex items-center gap-3">
                        <span className="text-slate-600 font-mono">{tx.operation_date}</span>
                        <span className="text-slate-300">{tx.description}</span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-500 text-[10px]">{tx.category}</span>
                      </div>
                      <span className="font-mono font-semibold text-red-400">-{fmt2(tx.amount_eur)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {data.expenses?.length > 0 && (
              <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
                <h3 className="text-sm font-semibold text-white mb-3">Voci di Spesa Registrate</h3>
                {data.expenses.map((e: any, i: number) => (
                  <div key={i} className="flex justify-between py-2 border-b border-slate-800/50 text-sm last:border-0">
                    <span className="text-slate-300 capitalize">{e.category.replace(/_/g, " ")}</span>
                    <span className="font-mono text-red-400">{fmt2(e.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── PROFIT ── */}
        {tab === "profit" && (
          <>
            {data.summary && (
              <div className="flex gap-4 flex-wrap mb-6">
                <KPI label="Ricavi Totali" value={fmt(data.summary.total_revenue || 0)} color="#10b981" />
                <KPI label="Spese Totali" value={fmt(data.summary.total_expenses || 0)} color="#ef4444" />
                <KPI
                  label="Profitto Netto"
                  value={fmt(data.summary.net_profit || 0)}
                  color={(data.summary.net_profit || 0) >= 0 ? "#10b981" : "#ef4444"}
                />
                <KPI label="IVA POS" value={fmt(data.summary.iva_pos || 0)} color="#8b5cf6" />
              </div>
            )}

            <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden mb-6">
              {/* REVENUES */}
              <div className="bg-emerald-950/30 px-5 py-3 border-b border-slate-800">
                <h3 className="text-sm font-bold text-emerald-400">RICAVI</h3>
              </div>
              {(data.revenues || []).map((r: any, i: number) => (
                <div key={i} className="flex justify-between px-5 py-3 border-b border-slate-800/40 text-sm">
                  <div>
                    <span className="text-slate-300 capitalize">{r.source?.replace(/_/g, " ")}</span>
                    {r.notes && <span className="text-slate-600 text-xs ml-2">({r.notes})</span>}
                  </div>
                  <span className="font-mono font-semibold text-emerald-400">{fmt2(r.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between px-5 py-3 bg-emerald-950/20 font-bold text-sm">
                <span className="text-emerald-400">TOTALE RICAVI</span>
                <span className="font-mono text-emerald-400">{fmt2(data.summary?.total_revenue || 0)}</span>
              </div>

              {/* EXPENSES */}
              <div className="bg-red-950/30 px-5 py-3 border-b border-t border-slate-800">
                <h3 className="text-sm font-bold text-red-400">SPESE</h3>
              </div>
              {(data.expenses || []).map((e: any, i: number) => (
                <div key={i} className="flex justify-between px-5 py-3 border-b border-slate-800/40 text-sm">
                  <div>
                    <span className="text-slate-300 capitalize">{e.category?.replace(/_/g, " ")}</span>
                    {e.notes && <span className="text-slate-600 text-xs ml-2">({e.notes})</span>}
                  </div>
                  <span className="font-mono font-semibold text-red-400">-{fmt2(e.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between px-5 py-3 bg-red-950/20 font-bold text-sm">
                <span className="text-red-400">TOTALE SPESE</span>
                <span className="font-mono text-red-400">-{fmt2(data.summary?.total_expenses || 0)}</span>
              </div>

              {/* NET PROFIT */}
              <div className={`flex justify-between px-5 py-4 font-bold text-lg ${
                (data.summary?.net_profit || 0) >= 0 ? "bg-emerald-950/30" : "bg-red-950/30"
              }`}>
                <span className={(data.summary?.net_profit || 0) >= 0 ? "text-emerald-300" : "text-red-300"}>
                  PROFITTO NETTO
                </span>
                <span className={`font-mono ${(data.summary?.net_profit || 0) >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                  {fmt2(data.summary?.net_profit || 0)}
                </span>
              </div>
            </div>

            {data.summary?.notes && (
              <div className="bg-indigo-950/30 border border-indigo-800/50 rounded-xl p-5 text-xs text-indigo-300">
                <strong>Note:</strong> {data.summary.notes}
              </div>
            )}

            {/* Trend comparison */}
            {data.trends?.monthly?.length > 1 && (
              <div className="bg-slate-900 rounded-xl border border-slate-800 p-5 mt-6">
                <h3 className="text-sm font-semibold text-white mb-4">Trend Profitto Netto</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={data.trends.monthly.map((m: any) => ({
                    period: `${PERIOD_LABELS[String(m.month).padStart(2, "0")] || m.month} ${String(m.year).slice(2)}`,
                    revenue: m.total_revenue,
                    expenses: m.total_expenses,
                    profit: m.net_profit,
                  }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="period" tick={{ fill: "#64748b", fontSize: 10 }} />
                    <YAxis tick={{ fill: "#64748b", fontSize: 10 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Bar dataKey="revenue" name="Ricavi" fill="#10b981" opacity={0.5} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="expenses" name="Spese" fill="#ef4444" opacity={0.5} radius={[4, 4, 0, 0]} />
                    <Line type="monotone" dataKey="profit" name="Profitto" stroke="#0ea5e9" strokeWidth={3} dot={{ r: 4 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
