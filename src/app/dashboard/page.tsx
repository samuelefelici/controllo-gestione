"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import DashboardUI from "../components/DashboardUI";

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
  const [error, setError] = useState("");

  useEffect(() => {
    if (!clientId) return;
    const params = new URLSearchParams();
    params.set("client_id", clientId);
    if (period) params.set("period", period);
    setLoading(true);
    setError("");
    fetch(`/api/data?${params}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); setData(null); }
        else { setData(d); if (!period && d.period) setPeriod(d.period); }
      })
      .catch(e => { console.error(e); setError("Errore di connessione"); })
      .finally(() => setLoading(false));
  }, [period, clientId]);

  return (
    <DashboardUI
      data={data}
      loading={loading}
      error={error}
      period={period}
      setPeriod={setPeriod}
      setData={setData}
      isPublic={false}
      clientId={clientId}
    />
  );
}
