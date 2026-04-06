"use client";

import { useState } from "react";
import Image from "next/image";
import { createSupabaseBrowser } from "@/lib/supabase-browser";

const supabase = createSupabaseBrowser();

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError(authError.message === "Invalid login credentials" ? "Email o password non corretti" : authError.message);
        return;
      }

      if (data.session) {
        window.location.href = "/admin";
      }
    } catch (err: any) {
      setError(err.message || "Errore di login");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4 relative overflow-hidden">
      {/* ═══ Background Effects ═══ */}
      {/* Gradient orbs */}
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-sky-500/[0.07] blur-[100px] animate-gradient" style={{ backgroundImage: "radial-gradient(circle, rgba(14,165,233,0.15), transparent)" }} />
      <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-indigo-500/[0.07] blur-[100px] animate-gradient animation-delay-400" style={{ backgroundImage: "radial-gradient(circle, rgba(99,102,241,0.15), transparent)" }} />
      <div className="absolute top-[30%] right-[20%] w-[300px] h-[300px] rounded-full bg-purple-500/[0.04] blur-[80px]" />

      {/* Orbiting dots */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-0 h-0">
        <div className="animate-orbit opacity-20">
          <div className="w-1.5 h-1.5 rounded-full bg-sky-400" />
        </div>
        <div className="animate-orbit opacity-10" style={{ animationDuration: "30s", animationDirection: "reverse" }}>
          <div className="w-1 h-1 rounded-full bg-indigo-400" style={{ transform: "translateX(200px)" }} />
        </div>
      </div>

      {/* Grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: "linear-gradient(rgba(148,163,184,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.3) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      {/* ═══ Login Card ═══ */}
      <div className="relative z-10 w-full max-w-md">
        {/* Card with glass effect */}
        <div className="animate-pulse-glow rounded-3xl">
          <div className="bg-slate-900/70 backdrop-blur-2xl border border-slate-800/60 rounded-3xl p-8 sm:p-10 shadow-2xl">

            {/* Logo */}
            <div className="flex justify-center mb-8 opacity-0 animate-fadeInUp">
              <div className="animate-float">
                <div className="relative w-72 h-72">
                  <Image
                    src="/logo.png"
                    alt="Felici Analytics"
                    fill
                    className="object-contain drop-shadow-2xl"
                    priority
                  />
                </div>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleLogin} className="space-y-5 opacity-0 animate-fadeInUp animation-delay-200">
              {/* Email */}
              <div className="relative group">
                <label className="block text-[11px] text-slate-500 uppercase tracking-wider font-semibold mb-2 ml-1">
                  Email
                </label>
                <div className={`relative rounded-xl transition-all duration-300 ${
                  focused === "email" ? "ring-2 ring-sky-500/50 shadow-lg shadow-sky-500/10" : ""
                }`}>
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 text-sm transition-colors group-focus-within:text-sky-400">
                    ✉️
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onFocus={() => setFocused("email")}
                    onBlur={() => setFocused(null)}
                    placeholder="tu@email.com"
                    required
                    className="w-full bg-slate-800/50 border border-slate-700/50 rounded-xl pl-11 pr-4 py-3.5 text-white text-sm focus:outline-none focus:border-sky-500/50 placeholder:text-slate-600 transition-all"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="relative group">
                <label className="block text-[11px] text-slate-500 uppercase tracking-wider font-semibold mb-2 ml-1">
                  Password
                </label>
                <div className={`relative rounded-xl transition-all duration-300 ${
                  focused === "password" ? "ring-2 ring-sky-500/50 shadow-lg shadow-sky-500/10" : ""
                }`}>
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 text-sm transition-colors group-focus-within:text-sky-400">
                    🔒
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setFocused("password")}
                    onBlur={() => setFocused(null)}
                    placeholder="••••••••"
                    required
                    className="w-full bg-slate-800/50 border border-slate-700/50 rounded-xl pl-11 pr-4 py-3.5 text-white text-sm focus:outline-none focus:border-sky-500/50 placeholder:text-slate-600 transition-all"
                  />
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="bg-red-950/40 border border-red-800/40 rounded-xl px-4 py-3 text-sm text-red-400 flex items-center gap-2 animate-fadeIn">
                  <span>⚠️</span>
                  <span>{error}</span>
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="relative w-full group overflow-hidden rounded-xl py-3.5 text-sm font-semibold text-white transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {/* Button gradient background */}
                <div className="absolute inset-0 bg-gradient-to-r from-sky-600 via-indigo-600 to-sky-600 animate-gradient transition-opacity group-hover:opacity-90" />
                {/* Shimmer overlay */}
                <div className="absolute inset-0 animate-shimmer opacity-0 group-hover:opacity-100 transition-opacity" />
                {/* Content */}
                <span className="relative z-10 flex items-center justify-center gap-2">
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Accesso in corso...
                    </>
                  ) : (
                    <>
                      Accedi
                      <svg className="w-4 h-4 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    </>
                  )}
                </span>
              </button>
            </form>

            {/* Divider */}
            <div className="mt-8 pt-6 border-t border-slate-800/60 opacity-0 animate-fadeInUp animation-delay-600">
              <div className="flex items-center justify-center gap-3 text-[10px] text-slate-600">
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/60 animate-pulse" />
                  <span>Sistema sicuro</span>
                </div>
                <span>•</span>
                <span>Crittografia end-to-end</span>
                <span>•</span>
                <span>GDPR compliant</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-[10px] text-slate-700 mt-6 opacity-0 animate-fadeIn animation-delay-600">
          © {new Date().getFullYear()} Felici Analytics — Tutti i diritti riservati
        </p>
      </div>
    </div>
  );
}
