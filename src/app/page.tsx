"use client";

import { useState, useCallback } from "react";
import Link from "next/link";

const FILE_TYPES = [
  { id: "sales_by_category", label: "Vendite per Categoria", desc: "PDF da Erply (Sales by Category)", icon: "📊", accept: ".pdf" },
  { id: "bank_movements", label: "Movimenti Bancari", desc: "XLS/PDF da Banca Popolare Pugliese", icon: "🏦", accept: ".xls,.xlsx,.pdf" },
  { id: "amex_statement", label: "Estratto Conto Amex", desc: "PDF da American Express", icon: "💳", accept: ".pdf" },
  { id: "payroll", label: "Cedolini Paga", desc: "PDF da TeamSystem", icon: "👥", accept: ".pdf" },
];

interface UploadResult {
  success: boolean;
  file_type: string;
  period: string;
  rows_imported: number;
  result: any;
  error?: string;
}

export default function HomePage() {
  const [uploads, setUploads] = useState<Record<string, { status: string; result?: UploadResult }>>({});
  const [period, setPeriod] = useState("2026-01");

  const handleUpload = useCallback(async (fileType: string, file: File) => {
    setUploads((prev) => ({ ...prev, [fileType]: { status: "uploading" } }));

    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", fileType);
    formData.append("period", period);

    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();

      if (res.ok) {
        setUploads((prev) => ({ ...prev, [fileType]: { status: "done", result: data } }));
      } else {
        setUploads((prev) => ({ ...prev, [fileType]: { status: "error", result: data } }));
      }
    } catch (err: any) {
      setUploads((prev) => ({ ...prev, [fileType]: { status: "error", result: { error: err.message } as any } }));
    }
  }, [period]);

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-500 flex items-center justify-center text-white font-bold text-lg">
              SW
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">Smart World SRLS</h1>
              <p className="text-xs text-slate-500">Business Intelligence</p>
            </div>
          </div>
          <Link
            href="/dashboard"
            className="px-5 py-2.5 bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            Apri Dashboard →
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        {/* Period selector */}
        <div className="mb-8 flex items-center gap-4">
          <label className="text-sm text-slate-400 font-medium">Periodo di riferimento:</label>
          <input
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white text-sm font-mono focus:ring-2 focus:ring-sky-500 focus:border-transparent"
          />
        </div>

        {/* Upload cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {FILE_TYPES.map((ft) => {
            const upload = uploads[ft.id];
            return (
              <div
                key={ft.id}
                className={`relative rounded-xl border p-6 transition-all ${
                  upload?.status === "done"
                    ? "border-emerald-500/50 bg-emerald-950/20"
                    : upload?.status === "error"
                    ? "border-red-500/50 bg-red-950/20"
                    : "border-slate-800 bg-slate-900/50 hover:border-slate-700"
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className="text-3xl">{ft.icon}</div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-white text-base">{ft.label}</h3>
                    <p className="text-xs text-slate-500 mt-1">{ft.desc}</p>

                    {/* File input */}
                    <label className="mt-4 block">
                      <input
                        type="file"
                        accept={ft.accept}
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleUpload(ft.id, file);
                        }}
                        disabled={upload?.status === "uploading"}
                      />
                      <span
                        className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors ${
                          upload?.status === "uploading"
                            ? "bg-slate-700 text-slate-400 cursor-wait"
                            : upload?.status === "done"
                            ? "bg-emerald-600 text-white hover:bg-emerald-500"
                            : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                        }`}
                      >
                        {upload?.status === "uploading" ? (
                          <>
                            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" opacity="0.25" />
                              <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            Elaborazione...
                          </>
                        ) : upload?.status === "done" ? (
                          "✓ Caricato — Clicca per ricaricare"
                        ) : (
                          "Seleziona file"
                        )}
                      </span>
                    </label>

                    {/* Result */}
                    {upload?.status === "done" && upload.result && (
                      <div className="mt-3 text-xs text-emerald-400 font-mono bg-emerald-950/40 rounded-lg p-3">
                        <p>Periodo: {upload.result.period}</p>
                        <p>Righe importate: {upload.result.rows_imported}</p>
                        {upload.result.result?.totals && (
                          <p>Vendite nette: €{upload.result.result.totals.net_sales?.toLocaleString("it-IT")}</p>
                        )}
                        {upload.result.result?.commissions && (
                          <p>
                            Commissioni: WU €{upload.result.result.commissions.wu?.toFixed(2)} |
                            MG €{upload.result.result.commissions.mg?.toFixed(2)} |
                            RIA €{upload.result.result.commissions.ria?.toFixed(2)}
                          </p>
                        )}
                        {upload.result.result?.total_gross !== undefined && (
                          <p>Lordo totale: €{upload.result.result.total_gross?.toFixed(2)}</p>
                        )}
                      </div>
                    )}
                    {upload?.status === "error" && (
                      <div className="mt-3 text-xs text-red-400 font-mono bg-red-950/40 rounded-lg p-3">
                        Errore: {upload.result?.error || "Upload fallito"}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Recalculate + status */}
        <div className="mt-6 flex items-center justify-between bg-slate-900/50 border border-slate-800 rounded-xl p-5">
          <div>
            <h3 className="text-sm font-semibold text-white">Ricalcolo Profitto</h3>
            <p className="text-xs text-slate-500 mt-1">Dopo aver caricato tutti i file, ricalcola il profitto netto mensile</p>
          </div>
          <button
            onClick={async () => {
              const res = await fetch(`/api/parse/recalculate?period=${period}`, { method: "POST" });
              const data = await res.json();
              if (data.success) {
                alert(`Profitto Netto ${period}: €${data.summary.net_profit.toFixed(2)}\n\nRicavi: €${data.summary.total_revenue.toFixed(2)}\nSpese: €${data.summary.total_expenses.toFixed(2)}\nMetodo margine: ${data.summary.product_profit_method}`);
              } else {
                alert("Errore: " + (data.error || "sconosciuto"));
              }
            }}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            Ricalcola
          </button>
        </div>

        {/* Instructions */}
        <div className="mt-10 rounded-xl border border-slate-800 bg-slate-900/30 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Come funziona</h2>
          <ol className="space-y-3 text-sm text-slate-400">
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-sky-600 text-white text-xs flex items-center justify-center font-bold">1</span>
              <span>Seleziona il <strong className="text-white">periodo</strong> di riferimento (es. 2026-01 per Gennaio 2026)</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-sky-600 text-white text-xs flex items-center justify-center font-bold">2</span>
              <span>Carica i <strong className="text-white">4 documenti</strong> mensili: vendite Erply, movimenti banca, estratto Amex, cedolini</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-sky-600 text-white text-xs flex items-center justify-center font-bold">3</span>
              <span>Il sistema <strong className="text-white">analizza automaticamente</strong> i file, estrae i dati e aggiorna la dashboard</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-sky-600 text-white text-xs flex items-center justify-center font-bold">4</span>
              <span>Vai alla <strong className="text-white">Dashboard</strong> per vedere KPI, grafici, profitto netto e trend</span>
            </li>
          </ol>
        </div>
      </main>
    </div>
  );
}
