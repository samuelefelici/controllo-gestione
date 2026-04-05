"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

const FILE_TYPES = [
  { id: "sales_by_category", label: "Vendite per Categoria", desc: "PDF export da POS (es. Erply)", icon: "📊", accept: ".pdf" },
  { id: "bank_movements", label: "Movimenti Bancari", desc: "XLS/XLSX export dalla banca", icon: "🏦", accept: ".xls,.xlsx" },
  { id: "amex_statement", label: "Estratto Conto Amex", desc: "PDF da American Express", icon: "💳", accept: ".pdf" },
  { id: "payroll", label: "Cedolini Paga", desc: "PDF da TeamSystem o simili", icon: "👥", accept: ".pdf" },
];

interface UploadResult {
  success: boolean;
  file_type: string;
  period: string;
  rows_imported: number;
  result: any;
  error?: string;
}

interface ClientInfo {
  id: string;
  slug: string;
  name: string;
  description: string | null;
}

export default function ClientManagePage() {
  const params = useParams();
  const clientId = params.clientId as string;

  const [client, setClient] = useState<ClientInfo | null>(null);
  const [uploads, setUploads] = useState<Record<string, { status: string; result?: UploadResult }>>({});
  const [period, setPeriod] = useState("2026-01");
  const [recentUploads, setRecentUploads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadClientInfo();
  }, [clientId]);

  async function loadClientInfo() {
    setLoading(true);
    const res = await fetch("/api/clients");
    if (res.ok) {
      const data = await res.json();
      const c = (data.clients || []).find((c: any) => c.id === clientId);
      setClient(c || null);
    }

    // Load recent uploads for this client
    const uploadsRes = await fetch(`/api/data?client_id=${clientId}&section=uploads`);
    if (uploadsRes.ok) {
      const data = await uploadsRes.json();
      setRecentUploads(data.uploads || []);
    }

    setLoading(false);
  }

  const handleUpload = useCallback(async (fileType: string, file: File) => {
    setUploads((prev) => ({ ...prev, [fileType]: { status: "uploading" } }));

    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", fileType);
    formData.append("period", period);
    formData.append("client_id", clientId);

    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();

      if (res.ok) {
        setUploads((prev) => ({ ...prev, [fileType]: { status: "done", result: data } }));
        loadClientInfo(); // Refresh uploads list
      } else {
        setUploads((prev) => ({ ...prev, [fileType]: { status: "error", result: data } }));
      }
    } catch (err: any) {
      setUploads((prev) => ({ ...prev, [fileType]: { status: "error", result: { error: err.message } as any } }));
    }
  }, [period, clientId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="animate-spin w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="text-center">
          <p className="text-xl text-slate-400 mb-4">Cliente non trovato</p>
          <Link href="/admin" className="text-sky-500 hover:text-sky-400 text-sm">← Torna ai Clienti</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-600/20 to-indigo-600/20 border border-sky-600/30 flex items-center justify-center text-sky-400 font-bold text-lg hover:border-sky-500/50 transition-colors">
              {client.name.charAt(0).toUpperCase()}
            </Link>
            <div>
              <h1 className="text-lg font-bold text-white">{client.name}</h1>
              <p className="text-[10px] text-slate-500">{client.slug}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href={`/dashboard?client_id=${clientId}`}
              className="px-5 py-2.5 bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              Dashboard →
            </Link>
            <Link
              href="/admin"
              className="text-xs text-slate-500 hover:text-sky-400"
            >
              ← Clienti
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
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

                    {upload?.status === "done" && upload.result && (
                      <div className="mt-3 text-xs text-emerald-400 font-mono bg-emerald-950/40 rounded-lg p-3">
                        <p>Periodo: {upload.result.period}</p>
                        <p>Righe importate: {upload.result.rows_imported}</p>
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

        {/* Recalculate */}
        <div className="mt-6 flex items-center justify-between bg-slate-900/50 border border-slate-800 rounded-xl p-5">
          <div>
            <h3 className="text-sm font-semibold text-white">Ricalcolo Profitto</h3>
            <p className="text-xs text-slate-500 mt-1">Dopo aver caricato tutti i file, ricalcola il profitto netto mensile</p>
          </div>
          <button
            onClick={async () => {
              const res = await fetch(`/api/parse/recalculate?period=${period}&client_id=${clientId}`, { method: "POST" });
              const data = await res.json();
              if (data.success) {
                alert(`Profitto Netto ${period}: €${data.summary.net_profit.toFixed(2)}\n\nRicavi: €${data.summary.total_revenue.toFixed(2)}\nSpese: €${data.summary.total_expenses.toFixed(2)}`);
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

        {/* Recent uploads */}
        {recentUploads.length > 0 && (
          <div className="mt-6 bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-3">Upload Recenti</h3>
            <div className="space-y-2">
              {recentUploads.slice(0, 10).map((u: any, i: number) => (
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
      </main>
    </div>
  );
}
