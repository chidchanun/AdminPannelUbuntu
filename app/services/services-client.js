"use client";

import { useCallback, useEffect, useState } from "react";
import AppSidebar, { AppMobileNav } from "@/app/components/app-sidebar";

function StatusBadge({ ok, state }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-sm font-bold ${
        ok ? "bg-emerald-400/12 text-emerald-200" : "bg-[#e95420]/18 text-[#ffb088]"
      }`}
    >
      {state}
    </span>
  );
}

export default function ServicesClient({ username }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [restarting, setRestarting] = useState(null);

  const loadServices = useCallback(async () => {
    setIsLoading(true);

    try {
      const response = await fetch("/api/services", { cache: "no-store" });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || `Services API returned ${response.status}`);
      }

      setData(payload);
      setError(null);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    async function loadInitialServices() {
      await loadServices();
    }

    loadInitialServices();
  }, [loadServices]);

  async function restartService(service) {
    setRestarting(service);

    try {
      const response = await fetch("/api/services", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ service }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || `Services API returned ${response.status}`);
      }

      setMessage(`${service} restarted.`);
      setError(null);
      await loadServices();
    } catch (restartError) {
      setError(restartError.message);
      setMessage(null);
    } finally {
      setRestarting(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#1c1b22] text-white">
      <AppMobileNav activeItem="Services" />
      <div className="grid min-h-screen lg:grid-cols-[280px_minmax(0,1fr)]">
        <AppSidebar
          activeItem="Services"
          helperText="Only allowlisted services can be restarted."
          username={username}
        />

        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_0%,rgba(233,84,32,0.20),transparent_30%),linear-gradient(135deg,rgba(44,0,30,0.58),rgba(17,17,17,0.98)_56%)]" />

          <div className="relative z-10 px-5 py-5 sm:px-8 lg:px-10">
            <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#ffb088]">
                  Services
                </p>
                <h1 className="mt-2 text-3xl font-bold tracking-normal">
                  Service Control
                </h1>
              </div>

              <div className="flex items-center gap-3">
                <button
                  className="h-10 rounded-md border border-white/14 px-4 text-sm font-semibold text-white transition hover:bg-white/10"
                  onClick={loadServices}
                  type="button"
                >
                  Refresh
                </button>
                <form action="/api/logout" method="post">
                  <button
                    className="h-10 rounded-md border border-white/14 px-4 text-sm font-semibold text-white transition hover:bg-white/10"
                    type="submit"
                  >
                    Logout
                  </button>
                </form>
              </div>
            </header>

            <div className="grid gap-5 py-7">
              {error ? (
                <section className="rounded-lg border border-[#e95420]/50 bg-[#e95420]/14 p-5">
                  <h2 className="text-xl font-bold tracking-normal">Service error</h2>
                  <p className="mt-2 text-sm leading-6 text-white/70">{error}</p>
                </section>
              ) : null}

              {message ? (
                <section className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-4">
                  <p className="text-sm font-semibold text-emerald-100">{message}</p>
                </section>
              ) : null}

              <section className="rounded-lg border border-white/10 bg-[#111111]/70 p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-xl font-bold tracking-normal">Restart Allowlist</h2>
                  <span className="text-sm text-white/50">
                    {data?.updatedAt ? new Date(data.updatedAt).toLocaleTimeString() : "Not updated"}
                  </span>
                </div>

                <div className="grid gap-3">
                  {isLoading ? (
                    <p className="rounded-md bg-black/20 px-4 py-5 text-sm text-white/58">
                      Loading services...
                    </p>
                  ) : null}

                  {(data?.services || []).map((service) => (
                    <div
                      className="grid gap-3 rounded-md border border-white/10 bg-white/[0.04] p-4 sm:grid-cols-[1fr_auto_auto] sm:items-center"
                      key={service.name}
                    >
                      <div>
                        <p className="font-bold text-white">{service.name}</p>
                        <p className="mt-1 text-sm text-white/54">
                          Managed by systemctl restart allowlist.
                        </p>
                      </div>
                      <StatusBadge ok={service.ok} state={service.state} />
                      <button
                        className="h-10 rounded-md bg-[#e95420] px-4 text-sm font-bold text-white transition hover:bg-[#c34113] disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={Boolean(restarting)}
                        onClick={() => restartService(service.name)}
                        type="button"
                      >
                        {restarting === service.name ? "Restarting" : "Restart"}
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
