"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import DashboardUI from "../../components/DashboardUI";

export default function PublicViewPage() {
  const params = useParams();
  const token = params.token as string;

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    const qs = new URLSearchParams();
    qs.set("token", token);
    if (period) qs.set("period", period);
    setLoading(true);
    setError("");
    fetch(`/api/public/data?${qs}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); setData(null); }
        else { setData(d); if (!period && d.period) setPeriod(d.period); }
      })
      .catch(e => { console.error(e); setError("Errore di connessione"); })
      .finally(() => setLoading(false));
  }, [period, token]);

  return (
    <DashboardUI
      data={data}
      loading={loading}
      error={error}
      period={period}
      setPeriod={setPeriod}
      setData={setData}
      isPublic={true}
    />
  );
}
