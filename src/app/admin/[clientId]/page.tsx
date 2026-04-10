"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { COLUMN_DEFS, type ColumnDef } from "@/lib/column-defs";

/* --- Types --- */

interface ClientInfo {
  id: string;
  slug: string;
  name: string;
  description: string | null;
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
  { id: "invoices", label: "Fatture Fornitori", desc: "Inserimento manuale fatture", icon: "🧾", accept: "" },
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

  // History edit state
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null);
  const [historyRows, setHistoryRows] = useState<Record<string, any>[]>([]);
  const [historyColumns, setHistoryColumns] = useState<ColumnDef[]>([]);
  const [historyFileType, setHistoryFileType] = useState<string>("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySaving, setHistorySaving] = useState(false);

  // Share state
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  // Invoice manual entry state
  const [invoiceMode, setInvoiceMode] = useState(false);
  const [invoiceRows, setInvoiceRows] = useState<Record<string, any>[]>([]);
  const [invoiceSaving, setInvoiceSaving] = useState(false);
  const [suppliers, setSuppliers] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);

  useEffect(() => {
    loadClientInfo();
    loadBatches();
    loadShareToken();
    loadSuppliersAndCategories();
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

  async function loadShareToken() {
    const res = await fetch(`/api/clients/${clientId}/share`);
    if (res.ok) {
      const data = await res.json();
      setShareToken(data.share_token || null);
    }
  }

  async function loadSuppliersAndCategories() {
    const [sRes, cRes] = await Promise.all([
      fetch(`/api/suppliers?client_id=${clientId}`),
      fetch(`/api/invoice-categories?client_id=${clientId}`),
    ]);
    if (sRes.ok) {
      const d = await sRes.json();
      setSuppliers((d.suppliers || []).map((s: any) => s.name));
    }
    if (cRes.ok) {
      const d = await cRes.json();
      setCategories((d.categories || []).map((c: any) => c.name));
    }
  }

  async function generateShareLink() {
    setShareLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/share`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setShareToken(data.share_token);
      }
    } finally {
      setShareLoading(false);
    }
  }

  function copyShareLink() {
    if (!shareToken) return;
    const url = `${window.location.origin}/view/${shareToken}`;
    navigator.clipboard.writeText(url);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
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

  /* --- Invoice Manual Entry --- */

  function startInvoiceMode() {
    setInvoiceMode(true);
    setInvoiceRows([{ supplier_name: "", category_name: "", amount: 0, notes: "" }]);
  }

  function cancelInvoiceMode() {
    setInvoiceMode(false);
    setInvoiceRows([]);
  }

  function updateInvoiceCell(rowIdx: number, key: string, value: string) {
    setInvoiceRows((prev) => {
      const next = [...prev];
      const row = { ...next[rowIdx] };
      if (key === "amount") {
        row[key] = parseFloat(value) || 0;
      } else {
        row[key] = value;
      }
      next[rowIdx] = row;
      return next;
    });
  }

  function deleteInvoiceRow(rowIdx: number) {
    setInvoiceRows((prev) => prev.filter((_, i) => i !== rowIdx));
  }

  function addInvoiceRow() {
    setInvoiceRows((prev) => [...prev, { supplier_name: "", category_name: "", amount: 0, notes: "" }]);
  }

  async function confirmInvoices() {
    const validRows = invoiceRows.filter((r) => r.supplier_name && r.amount);
    if (validRows.length === 0) {
      alert("Inserisci almeno una fattura con fornitore e importo.");
      return;
    }
    setInvoiceSaving(true);
    try {
      const res = await fetch("/api/import/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          file_type: "invoices",
          filename: `Fatture ${period}`,
          period,
          rows: validRows,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        cancelInvoiceMode();
        loadBatches();
        loadSuppliersAndCategories();
        setActiveTab("history");
      } else {
        alert("Errore: " + (data.error || "Salvataggio fallito"));
      }
    } catch (err: any) {
      alert("Errore: " + err.message);
    } finally {
      setInvoiceSaving(false);
    }
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
        if (editingBatchId === batchId) closeHistoryEdit();
      } else {
        alert("Errore: " + (data.error || "Annullamento fallito"));
      }
    } catch (err: any) {
      alert("Errore: " + err.message);
    } finally {
      setUndoing(null);
    }
  }

  /* --- History Edit --- */

  async function openBatchEdit(batch: ImportBatch) {
    if (editingBatchId === batch.id) {
      closeHistoryEdit();
      return;
    }
    setHistoryLoading(true);
    setEditingBatchId(batch.id);
    setHistoryFileType(batch.file_type);
    setHistoryColumns(COLUMN_DEFS[batch.file_type] || []);

    try {
      const res = await fetch(`/api/import/${batch.id}/rows`);
      const data = await res.json();

      if (res.ok && data.success) {
        setHistoryRows(JSON.parse(JSON.stringify(data.rows)));
      } else {
        alert("Errore caricamento righe: " + (data.error || "Errore"));
        closeHistoryEdit();
      }
    } catch (err: any) {
      alert("Errore: " + err.message);
      closeHistoryEdit();
    } finally {
      setHistoryLoading(false);
    }
  }

  function closeHistoryEdit() {
    setEditingBatchId(null);
    setHistoryRows([]);
    setHistoryColumns([]);
    setHistoryFileType("");
  }

  function updateHistoryCell(rowIdx: number, key: string, value: string) {
    setHistoryRows((prev) => {
      const next = [...prev];
      const row = { ...next[rowIdx] };
      const col = historyColumns.find((c) => c.key === key);
      if (col?.type === "number" || col?.type === "currency" || col?.type === "percent") {
        row[key] = parseFloat(value) || 0;
      } else {
        row[key] = value;
      }
      next[rowIdx] = row;
      return next;
    });
  }

  function deleteHistoryRow(rowIdx: number) {
    setHistoryRows((prev) => prev.filter((_, i) => i !== rowIdx));
  }

  function addHistoryRow() {
    const newRow: Record<string, any> = {};
    historyColumns.forEach((col) => {
      newRow[col.key] = col.type === "text" ? "" : 0;
    });
    setHistoryRows((prev) => [...prev, newRow]);
  }

  async function saveHistoryEdit() {
    if (!editingBatchId) return;
    setHistorySaving(true);

    try {
      const res = await fetch(`/api/import/${editingBatchId}/rows`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: historyRows }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        loadBatches();
        closeHistoryEdit();
      } else {
        alert("Errore salvataggio: " + (data.error || "Errore"));
      }
    } catch (err: any) {
      alert("Errore: " + err.message);
    } finally {
      setHistorySaving(false);
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
            {/* Share button */}
            {shareToken ? (
              <button
                onClick={copyShareLink}
                className="px-4 py-2.5 bg-emerald-600/20 border border-emerald-600/30 hover:bg-emerald-600/30 text-emerald-400 text-sm font-semibold rounded-lg transition-colors"
              >
                {shareCopied ? "✅ Copiato!" : "🔗 Link Cliente"}
              </button>
            ) : (
              <button
                onClick={generateShareLink}
                disabled={shareLoading}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-lg transition-colors disabled:opacity-50"
              >
                {shareLoading ? "..." : "🔗 Genera Link"}
              </button>
            )}
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
            {!preview && !parsing && !invoiceMode && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {FILE_TYPES.map((ft) => (
                  <div key={ft.id} className="rounded-xl border border-slate-800 bg-slate-900/50 hover:border-slate-700 p-6 transition-all">
                    <div className="flex items-start gap-4">
                      <div className="text-3xl">{ft.icon}</div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-white text-base">{ft.label}</h3>
                        <p className="text-xs text-slate-500 mt-1">{ft.desc}</p>
                        {ft.id === "invoices" ? (
                          <button
                            onClick={startInvoiceMode}
                            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer bg-sky-600 text-white hover:bg-sky-500 transition-colors"
                          >
                            + Inserisci Fatture
                          </button>
                        ) : (
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
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Invoice manual entry form */}
            {invoiceMode && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                      🧾 Inserimento Fatture Fornitori
                    </h2>
                    <p className="text-xs text-slate-500 mt-1">
                      {invoiceRows.length} {invoiceRows.length === 1 ? "riga" : "righe"} · Periodo: {period}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={cancelInvoiceMode}
                      className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white bg-slate-800 rounded-lg transition-colors"
                    >
                      ✕ Annulla
                    </button>
                    <button
                      onClick={confirmInvoices}
                      disabled={invoiceSaving || invoiceRows.length === 0}
                      className="px-6 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {invoiceSaving ? (
                        <>
                          <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                          Salvataggio...
                        </>
                      ) : (
                        <>✓ Conferma Import ({invoiceRows.filter(r => r.supplier_name && r.amount).length} fatture)</>
                      )}
                    </button>
                  </div>
                </div>

                {/* Datalists for autocomplete */}
                <datalist id="supplier-list">
                  {suppliers.map((s) => <option key={s} value={s} />)}
                </datalist>
                <datalist id="category-list">
                  {categories.map((c) => <option key={c} value={c} />)}
                </datalist>

                <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-800/80">
                          <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider w-[30%]">Fornitore</th>
                          <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider w-[25%]">Categoria</th>
                          <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider w-[15%]">Totale €</th>
                          <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider w-[25%]">Note</th>
                          <th className="px-3 py-2.5 w-10" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/50">
                        {invoiceRows.map((row, rowIdx) => (
                          <tr key={rowIdx} className="hover:bg-slate-800/30 transition-colors">
                            <td className="px-3 py-1.5">
                              <input
                                type="text"
                                list="supplier-list"
                                placeholder="Nome fornitore..."
                                value={row.supplier_name}
                                onChange={(e) => updateInvoiceCell(rowIdx, "supplier_name", e.target.value)}
                                className="w-full bg-transparent border border-slate-700 hover:border-slate-600 focus:border-sky-500 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-sky-500/50 transition-colors"
                              />
                            </td>
                            <td className="px-3 py-1.5">
                              <input
                                type="text"
                                list="category-list"
                                placeholder="Categoria..."
                                value={row.category_name}
                                onChange={(e) => updateInvoiceCell(rowIdx, "category_name", e.target.value)}
                                className="w-full bg-transparent border border-slate-700 hover:border-slate-600 focus:border-sky-500 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-sky-500/50 transition-colors"
                              />
                            </td>
                            <td className="px-3 py-1.5">
                              <input
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                value={row.amount || ""}
                                onChange={(e) => updateInvoiceCell(rowIdx, "amount", e.target.value)}
                                className="w-full bg-transparent border border-slate-700 hover:border-slate-600 focus:border-sky-500 rounded px-2 py-1.5 text-sm text-white font-mono focus:outline-none focus:ring-1 focus:ring-sky-500/50 transition-colors"
                              />
                            </td>
                            <td className="px-3 py-1.5">
                              <input
                                type="text"
                                placeholder="Note opzionali..."
                                value={row.notes}
                                onChange={(e) => updateInvoiceCell(rowIdx, "notes", e.target.value)}
                                className="w-full bg-transparent border border-slate-700 hover:border-slate-600 focus:border-sky-500 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-sky-500/50 transition-colors"
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <button
                                onClick={() => deleteInvoiceRow(rowIdx)}
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

                  <div className="border-t border-slate-800 px-4 py-3 flex items-center justify-between">
                    <button
                      onClick={addInvoiceRow}
                      className="text-xs text-sky-500 hover:text-sky-400 font-medium flex items-center gap-1"
                    >
                      + Aggiungi riga
                    </button>
                    <div className="text-xs text-slate-500 font-mono flex gap-4">
                      <span>{invoiceRows.filter(r => r.supplier_name && r.amount).length} fatture valide</span>
                      <span>Totale: €{invoiceRows.reduce((s, r) => s + (r.amount || 0), 0).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
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
                      ) : preview.file_type === "amex_statement" ? (
                        <>
                          <span>Addebiti: €{editedRows.filter(r => (r.amount_eur || 0) > 0).reduce((s, r) => s + r.amount_eur, 0).toFixed(2)}</span>
                          <span>Accrediti: €{editedRows.filter(r => (r.amount_eur || 0) < 0).reduce((s, r) => s + Math.abs(r.amount_eur), 0).toFixed(2)}</span>
                          <span>{editedRows.length} operazioni</span>
                        </>
                      ) : preview.file_type === "payroll" ? (
                        <>
                          <span>{editedRows.length} dipendenti</span>
                          <span>Tot. Lordo: €{editedRows.reduce((s, r) => s + (r.gross_pay || 0), 0).toFixed(2)}</span>
                          <span>Tot. Netto: €{editedRows.reduce((s, r) => s + (r.net_pay || 0), 0).toFixed(2)}</span>
                          <span>Tot. TFR: €{editedRows.reduce((s, r) => s + (r.tfr_month || 0), 0).toFixed(2)}</span>
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
                  <div key={batch.id}>
                    <div
                      className={`flex items-center justify-between rounded-xl border p-4 transition-all ${
                        batch.undone_at
                          ? "border-slate-800/50 bg-slate-900/30 opacity-50"
                          : editingBatchId === batch.id
                          ? "border-sky-600 bg-slate-900/80 ring-1 ring-sky-600/30"
                          : "border-slate-800 bg-slate-900/50 hover:border-slate-700 cursor-pointer"
                      }`}
                      onClick={() => !batch.undone_at && openBatchEdit(batch)}
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

                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        {!batch.undone_at && (
                          <>
                            <button
                              onClick={() => openBatchEdit(batch)}
                              className={`px-4 py-2 text-xs font-medium rounded-lg transition-colors ${
                                editingBatchId === batch.id
                                  ? "text-sky-300 bg-sky-950/50 border border-sky-700/50"
                                  : "text-sky-400 hover:text-sky-300 bg-sky-950/30 hover:bg-sky-950/50 border border-sky-900/30"
                              }`}
                            >
                              {editingBatchId === batch.id ? "▼ Chiudi" : "✏️ Modifica"}
                            </button>
                            <button
                              onClick={() => undoImport(batch.id)}
                              disabled={undoing === batch.id}
                              className="px-4 py-2 text-xs font-medium text-red-400 hover:text-red-300 bg-red-950/30 hover:bg-red-950/50 border border-red-900/30 rounded-lg transition-colors disabled:opacity-50"
                            >
                              {undoing === batch.id ? "Annullamento..." : "↩ Annulla"}
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Expanded edit area */}
                    {editingBatchId === batch.id && !batch.undone_at && (
                      <div className="mt-2 rounded-xl border border-slate-800 bg-slate-900/70 overflow-hidden">
                        {historyLoading ? (
                          <div className="flex flex-col items-center justify-center py-12 gap-3">
                            <div className="animate-spin w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full" />
                            <p className="text-slate-400 text-sm">Caricamento righe...</p>
                          </div>
                        ) : (
                          <div>
                            {/* Edit header */}
                            <div className="flex items-center justify-between px-4 py-3 bg-slate-800/50 border-b border-slate-800">
                              <p className="text-xs text-slate-400">
                                {historyRows.length} righe · Modifica le celle e salva
                              </p>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={closeHistoryEdit}
                                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-white bg-slate-800 rounded-lg transition-colors"
                                >
                                  ✕ Chiudi
                                </button>
                                <button
                                  onClick={saveHistoryEdit}
                                  disabled={historySaving || historyRows.length === 0}
                                  className="px-4 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                                >
                                  {historySaving ? (
                                    <>
                                      <div className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full" />
                                      Salvataggio...
                                    </>
                                  ) : (
                                    <>✓ Salva Modifiche</>
                                  )}
                                </button>
                              </div>
                            </div>

                            {/* Editable table */}
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="bg-slate-800/40">
                                    {historyColumns.map((col) => (
                                      <th key={col.key} className="px-3 py-2 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">
                                        {col.label}
                                      </th>
                                    ))}
                                    <th className="px-3 py-2 w-10" />
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/50">
                                  {historyRows.map((row, rowIdx) => (
                                    <tr key={rowIdx} className="hover:bg-slate-800/30 transition-colors">
                                      {historyColumns.map((col) => (
                                        <td key={col.key} className="px-3 py-1.5">
                                          {col.editable ? (
                                            <input
                                              type={col.type === "text" ? "text" : "number"}
                                              step={col.type === "currency" || col.type === "percent" ? "0.01" : "1"}
                                              value={row[col.key] ?? ""}
                                              onChange={(e) => updateHistoryCell(rowIdx, col.key, e.target.value)}
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
                                          onClick={() => deleteHistoryRow(rowIdx)}
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

                            {/* Footer with add row + totals */}
                            <div className="border-t border-slate-800 px-4 py-3 flex items-center justify-between">
                              <button
                                onClick={addHistoryRow}
                                className="text-xs text-sky-500 hover:text-sky-400 font-medium flex items-center gap-1"
                              >
                                + Aggiungi riga
                              </button>
                              <div className="text-xs text-slate-500 font-mono flex gap-4">
                                {historyFileType === "sales_by_category" ? (
                                  <>
                                    <span>Netto: €{historyRows.reduce((s, r) => s + (r.net_sales || 0), 0).toFixed(2)}</span>
                                    <span>IVA: €{historyRows.reduce((s, r) => s + (r.vat_amount || 0), 0).toFixed(2)}</span>
                                    <span>Totale: €{historyRows.reduce((s, r) => s + (r.sales_with_vat || 0), 0).toFixed(2)}</span>
                                  </>
                                ) : historyFileType === "bank_movements" ? (
                                  <>
                                    <span>Entrate: €{historyRows.filter(r => r.amount > 0).reduce((s, r) => s + r.amount, 0).toFixed(2)}</span>
                                    <span>Uscite: €{historyRows.filter(r => r.amount < 0).reduce((s, r) => s + Math.abs(r.amount), 0).toFixed(2)}</span>
                                    <span>Saldo: €{historyRows.reduce((s, r) => s + (r.amount || 0), 0).toFixed(2)}</span>
                                  </>
                                ) : historyFileType === "amex_statement" ? (
                                  <>
                                    <span>Addebiti: €{historyRows.filter(r => (r.amount_eur || 0) > 0).reduce((s, r) => s + r.amount_eur, 0).toFixed(2)}</span>
                                    <span>Accrediti: €{historyRows.filter(r => (r.amount_eur || 0) < 0).reduce((s, r) => s + Math.abs(r.amount_eur), 0).toFixed(2)}</span>
                                    <span>{historyRows.length} operazioni</span>
                                  </>
                                ) : historyFileType === "payroll" ? (
                                  <>
                                    <span>{historyRows.length} dipendenti</span>
                                    <span>Tot. Lordo: €{historyRows.reduce((s, r) => s + (r.gross_pay || 0), 0).toFixed(2)}</span>
                                    <span>Tot. Netto: €{historyRows.reduce((s, r) => s + (r.net_pay || 0), 0).toFixed(2)}</span>
                                    <span>Tot. TFR: €{historyRows.reduce((s, r) => s + (r.tfr_month || 0), 0).toFixed(2)}</span>
                                  </>
                                ) : historyFileType === "invoices" ? (
                                  <>
                                    <span>{historyRows.length} fatture</span>
                                    <span>Totale: €{historyRows.reduce((s, r) => s + (r.amount || 0), 0).toFixed(2)}</span>
                                  </>
                                ) : (
                                  <span>{historyRows.length} righe</span>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
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
