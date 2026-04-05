"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Client {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

export default function AdminPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("");

  // New client form
  const [showForm, setShowForm] = useState(false);
  const [newSlug, setNewSlug] = useState("");
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      window.location.href = "/login";
      return;
    }
    setUserName(user.email || "Utente");

    // Fetch clients via API (uses service role to bypass RLS)
    const res = await fetch("/api/clients");
    if (res.ok) {
      const data = await res.json();
      setClients(data.clients || []);
    }

    setLoading(false);
  }

  async function handleCreateClient(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const res = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: newSlug, name: newName, description: newDesc }),
    });

    if (res.ok) {
      setShowForm(false);
      setNewSlug("");
      setNewName("");
      setNewDesc("");
      loadData();
    } else {
      const err = await res.json();
      alert("Errore: " + (err.error || "sconosciuto"));
    }

    setSaving(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="animate-spin w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center text-white font-bold text-lg">
              FF
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Controllo Gestione</h1>
              <p className="text-[10px] text-slate-500">Portale Amministrazione</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-400">{userName}</span>
            <button
              onClick={handleLogout}
              className="text-xs text-slate-500 hover:text-red-400 transition-colors"
            >
              Esci
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Title + Add button */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-white">I tuoi Clienti</h2>
            <p className="text-sm text-slate-500 mt-1">Seleziona un cliente per gestire documenti e dashboard</p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-5 py-2.5 bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            + Nuovo Cliente
          </button>
        </div>

        {/* New client form */}
        {showForm && (
          <form onSubmit={handleCreateClient} className="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-8 space-y-4">
            <h3 className="text-lg font-semibold text-white">Aggiungi Nuovo Cliente</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Slug (identificativo unico)</label>
                <input
                  value={newSlug}
                  onChange={(e) => setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                  placeholder="es: pizzeria-mario"
                  required
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white text-sm"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Nome Azienda</label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="es: Pizzeria Mario SRL"
                  required
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Descrizione (opzionale)</label>
              <input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Breve descrizione attività"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white text-sm"
              />
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                {saving ? "Salvataggio..." : "Crea Cliente"}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-lg transition-colors"
              >
                Annulla
              </button>
            </div>
          </form>
        )}

        {/* Client cards */}
        {clients.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">📂</div>
            <p className="text-xl text-slate-400">Nessun cliente ancora</p>
            <p className="text-sm text-slate-600 mt-2">Clicca &quot;Nuovo Cliente&quot; per iniziare</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {clients.map((client) => (
              <Link
                key={client.id}
                href={`/admin/${client.id}`}
                className="group bg-slate-900 border border-slate-800 rounded-xl p-6 hover:border-sky-600/50 hover:bg-slate-900/80 transition-all"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-sky-600/20 to-indigo-600/20 border border-sky-600/30 flex items-center justify-center text-sky-400 font-bold text-lg flex-shrink-0">
                    {client.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-white text-base group-hover:text-sky-400 transition-colors truncate">
                      {client.name}
                    </h3>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">{client.slug}</p>
                    {client.description && (
                      <p className="text-xs text-slate-500 mt-2 line-clamp-2">{client.description}</p>
                    )}
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                    client.is_active ? "bg-emerald-950 text-emerald-400" : "bg-red-950 text-red-400"
                  }`}>
                    {client.is_active ? "Attivo" : "Inattivo"}
                  </span>
                  <span className="text-xs text-slate-600 group-hover:text-sky-500 transition-colors">
                    Gestisci →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
