"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

/* --- Types --- */

interface ClientInfo {
  id: string;
  slug: string;
  name: string;
  description: string | null;
}

interface ColumnDef {
  key: string;
  label: string;
  type: "text" | "number" | "currency" | "percent";
  editable: boolean;
}

interface PreviewData {
  file_type: string;
  filename: string;
  period: string;
  columns: ColumnDef[];
  rows: Record<string, any>[];
  totals: Record<string, number>;
}

interface ImportBatch {
  id: string;
  file_type: string;
  filename: string;
  period: string;
  rows_imported: number;
  imported_at: string;
  undone_at: string | null;
}

const FILE_TYPES = [
  { id: "sales_by_category", label: "Vendite per Categoria", desc: "PDF export da POS (es. Erply)", icon: "📊", accept: ".pdf" },
  { id: "bank_movements", label: "Movimenti Bancari", desc: "PDF Lista Movimenti dalla banca", icon: "🏦", accept: ".pdf" },
  { id: "amex_statement", label: "Estratto Conto Amex", desc: "PDF da American Express", icon: "💳", accept: ".pdf" },
  { id: "payroll", label: "Cedolini Paga", desc: "PDF da TeamSystem o simili", icon: "👥", accept: ".pdf" },
];

/* --- Main Page --- */

export default function ClientManagePage() {
  const params = useParams();
  const clientId = params.clientId as string;

  const [client, setClient] = useState<ClientInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"import" | "history">("import");

  // Preview state
  const [parsing, setParsing] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [editedRows, setEditedRows] = useState<Record<string, any>[]>([]);
  const [saving, setSaving] = useState(false);
  const [period, setPeriod] = useState("2026-01");

  // History state
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [undoing, setUndoing] = useState<string | null>(null);

  useEffect(() => {
    loadClientInfo();
    loadBatches();
  }, [clientId]);

  async function loadClientInfo() {
    setLoading(true);
    const res = await fetch("/api/clients");
    if (res.ok) {
      const data = await res.json();
      const c = (data.clients || []).find((c: any) => c.id === clientId);
      setClient(c || null);
    }
    setLoading(false);
  }

  async function loadBatches() {
    const res = await fetch(`/api/data?client_id=${clientId}&section=batches`);
    if (res.ok) {
      const data = await res.json();
      setBatches(data.batches || []);
    }
  }

  /* --- Upload & Parse --- */

  const handleFileUpload = useCallback(async (fileType: string, file: File) => {
    setParsing(true);
    setPreview(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", fileType);

    try {
      const res = await fetch("/api/parse-preview", { method: "POST", body: formData });
      const data = await res.json();

      if (res.ok && data.success) {
        const previewData: PreviewData = {
          file_type: data.file_type,
          filename: data.filename,
          period: data.period || period,
          columns: data.columns,
          rows: data.rows,
          totals: data.totals,
        };
        setPreview(previewData);
        setEditedRows(JSON.parse(JSON.stringify(data.rows)));
        if (data.period) setPeriod(data.period);
      } else {
        alert("Errore: " + (data.error || data.details || "Parsing fallito"));
      }
    } catch (err: any) {
      alert("Errore di rete: " + err.message);
    } finally {
      setParsing(false);
    }
  }, [period]);

  /* --- Edit Row --- */

  function updateCell(rowIdx: number, key: string, value: string) {
    setEditedRows((prev) => {
      const next = [...prev];
      const row = { ...next[rowIdx] };
      const col = preview?.columns.find((c) => c.key === key);
      if (col?.type === "number" || col?.type === "currency" || col?.type === "percent") {
        row[key] = parseFloat(value) || 0;
      } else {
        row[key] = value;
      }
      next[rowIdx] = row;
      return next;
    });
  }

  function deleteRow(rowIdx: number) {
    setEditedRows((prev) => prev.filter((_, i) => i !== rowIdx));
  }

  function addRow() {
    if (!preview) return;
    const newRow: Record<string, any> = {};
    preview.columns.forEach((col) => {
      newRow[col.key] = col.type === "text" ? "" : 0;
    });
    newRow.rank = editedRows.length + 1;
    setEditedRows((prev) => [...prev, newRow]);
  }

  /* --- Confirm Import --- */

  async function confirmImport() {
    if (!preview) return;
    setSaving(true);

    try {
      const res = await fetch("/api/import/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          file_type: preview.file_type,
          filename: preview.filename,
          period: period,
          rows: editedRows,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setPreview(null);
        setEditedRows([]);
        loadBatches();
        setActiveTab("history");
      } else {
        alert("Errore: " + (data.error || "Salvataggio fallito"));
      }
    } catch (err: any) {
      alert("Errore: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  /* --- Undo Import --- */

  async function undoImport(batchId: string) {
    if (!confirm("Sei sicuro di voler annullare questo import? Le righe verranno eliminate.")) return;
    setUndoing(batchId);

    try {
      const res = await fetch(`/api/import/${batchId}`, { method: "DELETE" });
      const data = await res.json();

      if (res.ok && data.success) {
        loadBatches();
      } else {
        alert("Errore: " + (data.error || "Annullamento fallito"));
      }
    } catch (err: any) {
      alert("Errore: " + err.message);
    } finally {
      setUndoing(null);
    }
  }

  /* --- Render --- */

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
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
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
            <Link href={`/dashboard?client_id=${clientId}`} className="px-5 py-2.5 bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold rounded-lg transition-colors">
              Dashboard →
            </Link>
            <Link href="/admin" className="text-xs text-slate-500 hover:text-sky-400">← Clienti</Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-slate-900 rounded-lg p-1 w-fit">
          <button
            onClick={() => setActiveTab("import")}
            className={`px-5 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === "import" ? "bg-sky-600 text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            📥 Importa
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`px-5 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === "history" ? "bg-sky-600 text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            📋 Storico Import ({batches.filter((b) => !b.undone_at).length})
          </button>
        </div>

        {/* === IMPORT TAB === */}
        {activeTab === "import" && (
          <div>
            {/* Period selector */}
            <div className="mb-6 flex items-center gap-4">
              <label className="text-sm text-slate-400 font-medium">Periodo:</label>
              <input
                type="month"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white text-sm font-mono focus:ring-2 focus:ring-sky-500 focus:border-transparent"
              />
            </div>

            {/* Preview not active: show upload cards */}
            {!preview && !parsing && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {FILE_TYPES.map((ft) => (
                  <div key={ft.id} className="rounded-xl border border-slate-800 bg-slate-900/50 hover:border-slate-700 p-6 transition-all">
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
                              if (file) handleFileUpload(ft.id, file);
                            }}
                          />
                          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors">
                            Seleziona file
                          </span>
                        </label>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Parsing spinner */}
            {parsing && (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <div className="animate-spin w-10 h-10 border-3 border-sky-500 border-t-transparent rounded-full" />
                <p className="text-slate-400 text-sm">Analisi del file in corso...</p>
              </div>
            )}

            {/* Preview table */}
            {preview && !parsing && (
              <div>
                {/* Preview header */}
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                      📋 Anteprima: {preview.filename}
                    </h2>
                    <p className="text-xs text-slate-500 mt-1">
                      {editedRows.length} righe · Periodo: {period} · Modifica le celle prima di confermare
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setPreview(null); setEditedRows([]); }}
                      className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white bg-slate-800 rounded-lg transition-colors"
                    >
                      ✕ Annulla
                    </button>
                    <button
                      onClick={confirmImport}
                      disabled={saving || editedRows.length === 0}
                      className="px-6 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {saving ? (
                        <>
                          <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                          Salvataggio...
                        </>
                      ) : (
                        <>✓ Conferma Import ({editedRows.length} righe)</>
                      )}
                    </button>
                  </div>
                </div>

                {/* Editable table */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-800/80">
                          {preview.columns.map((col) => (
                            <th key={col.key} className="px-3 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">
                              {col.label}
                            </th>
                          ))}
                          <th className="px-3 py-2.5 w-10" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/50">
                        {editedRows.map((row, rowIdx) => (
                          <tr key={rowIdx} className="hover:bg-slate-800/30 transition-colors">
                            {preview.columns.map((col) => (
                              <td key={col.key} className="px-3 py-1.5">
                                {col.editable ? (
                                  <input
                                    type={col.type === "text" ? "text" : "number"}
                                    step={col.type === "currency" || col.type === "percent" ? "0.01" : "1"}
                                    value={row[col.key] ?? ""}
                                    onChange={(e) => updateCell(rowIdx, col.key, e.target.value)}
                                    className="w-full bg-transparent border border-transparent hover:border-slate-700 focus:border-sky-500 rounded px-2 py-1 text-sm text-white font-mono focus:outline-none focus:ring-1 focus:ring-sky-500/50 transition-colors"
                                  />
                                ) : (
                                  <span className="px-2 py-1 text-slate-400 font-mono text-sm">
                                    {row[col.key]}
                                  </span>
                                )}
                              </td>
                            ))}
                            <td className="px-2 py-1.5">
                              <button
                                onClick={() => deleteRow(rowIdx)}
                                className="text-red-500/50 hover:text-red-400 transition-colors p-1"
                                title="Elimina riga"
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Add row + totals */}
                  <div className="border-t border-slate-800 px-4 py-3 flex items-center justify-between">
                    <button
                      onClick={addRow}
                      className="text-xs text-sky-500 hover:text-sky-400 font-medium flex items-center gap-1"
                    >
                      + Aggiungi riga
                    </button>
                    <div className="text-xs text-slate-500 font-mono flex gap-4">
                      {preview.file_type === "sales_by_category" ? (
                        <>
                          <span>Netto: €{editedRows.reduce((s, r) => s + (r.net_sales || 0), 0).toFixed(2)}</span>
                          <span>IVA: €{editedRows.reduce((s, r) => s + (r.vat_amount || 0), 0).toFixed(2)}</span>
                          <span>Totale: €{editedRows.reduce((s, r) => s + (r.sales_with_vat || 0), 0).toFixed(2)}</span>
                        </>
                      ) : preview.file_type === "bank_movements" ? (
                        <>
                          <span>Entrate: €{editedRows.filter(r => r.amount > 0).reduce((s, r) => s + r.amount, 0).toFixed(2)}</span>
                          <span>Uscite: €{editedRows.filter(r => r.amount < 0).reduce((s, r) => s + Math.abs(r.amount), 0).toFixed(2)}</span>
                          <span>Saldo: €{editedRows.reduce((s, r) => s + (r.amount || 0), 0).toFixed(2)}</span>
                        </>
                      ) : (
                        <span>{editedRows.length} righe</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* === HISTORY TAB === */}
        {activeTab === "history" && (
          <div>
            <h2 className="text-lg font-bold text-white mb-4">Storico Importazioni</h2>

            {batches.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-slate-500 text-sm">Nessuna importazione effettuata</p>
              </div>
            ) : (
              <div className="space-y-3">
                {batches.map((batch) => (
                  <div
                    key={batch.id}
                    className={`flex items-center justify-between rounded-xl border p-4 transition-all ${
                      batch.undone_at
                        ? "border-slate-800/50 bg-slate-900/30 opacity-50"
                        : "border-slate-800 bg-slate-900/50"
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg ${
                        batch.undone_at ? "bg-slate-800 grayscale" : "bg-sky-600/20"
                      }`}>
                        {FILE_TYPES.find((ft) => ft.id === batch.file_type)?.icon || "📄"}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">
                          {batch.filename}
                          {batch.undone_at && <span className="text-red-400 text-xs ml-2">(annullato)</span>}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {batch.rows_imported} righe · {batch.period} · {new Date(batch.imported_at).toLocaleString("it-IT")}
                        </p>
                      </div>
                    </div>

                    {!batch.undone_at && (
                      <button
                        onClick={() => undoImport(batch.id)}
                        disabled={undoing === batch.id}
                        className="px-4 py-2 text-xs font-medium text-red-400 hover:text-red-300 bg-red-950/30 hover:bg-red-950/50 border border-red-900/30 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {undoing === batch.id ? "Annullamento..." : "↩ Annulla Import"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
