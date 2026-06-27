"use client";

import { useCallback, useEffect, useState } from "react";
import AppSidebar, { AppMobileNav } from "@/app/components/app-sidebar";

const FILTERS = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "Failed", value: "failed" },
  { label: "Inactive", value: "inactive" },
  { label: "Restartable", value: "restartable" },
];

function StatusBadge({ ok, state, subState }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-sm font-bold ${
        ok ? "bg-emerald-400/12 text-emerald-200" : "bg-[#e95420]/18 text-[#ffb088]"
      }`}
    >
      {subState && subState !== state ? `${state} / ${subState}` : state}
    </span>
  );
}

export default function ServicesClient({ username }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("all");
  const [message, setMessage] = useState(null);
  const [query, setQuery] = useState("");
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

  const filteredServices = (data?.services || []).filter((service) => {
    const queryValue = query.trim().toLowerCase();
    const matchesQuery =
      !queryValue ||
      service.name.toLowerCase().includes(queryValue) ||
      String(service.description || "").toLowerCase().includes(queryValue) ||
      String(service.state || "").toLowerCase().includes(queryValue) ||
      String(service.subState || "").toLowerCase().includes(queryValue);
    const matchesFilter =
      filter === "all" ||
      service.state === filter ||
      (filter === "restartable" && service.restartAllowed);

    return matchesQuery && matchesFilter;
  });

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

              {data?.error ? (
                <section className="rounded-lg border border-[#e95420]/40 bg-[#e95420]/12 p-4">
                  <p className="text-sm leading-6 text-white/72">{data.error}</p>
                </section>
              ) : null}

              {message ? (
                <section className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-4">
                  <p className="text-sm font-semibold text-emerald-100">{message}</p>
                </section>
              ) : null}

              <section className="grid gap-4 md:grid-cols-5">
                <article className="rounded-lg border border-white/10 bg-white/[0.05] p-5">
                  <p className="text-sm font-semibold text-white/56">Total</p>
                  <p className="mt-2 text-3xl font-bold">{data?.summary?.total ?? 0}</p>
                </article>
                <article className="rounded-lg border border-white/10 bg-white/[0.05] p-5">
                  <p className="text-sm font-semibold text-white/56">Active</p>
                  <p className="mt-2 text-3xl font-bold">{data?.summary?.active ?? 0}</p>
                </article>
                <article className="rounded-lg border border-white/10 bg-white/[0.05] p-5">
                  <p className="text-sm font-semibold text-white/56">Failed</p>
                  <p className="mt-2 text-3xl font-bold">{data?.summary?.failed ?? 0}</p>
                </article>
                <article className="rounded-lg border border-white/10 bg-white/[0.05] p-5">
                  <p className="text-sm font-semibold text-white/56">Inactive</p>
                  <p className="mt-2 text-3xl font-bold">{data?.summary?.inactive ?? 0}</p>
                </article>
                <article className="rounded-lg border border-white/10 bg-white/[0.05] p-5">
                  <p className="text-sm font-semibold text-white/56">Restartable</p>
                  <p className="mt-2 text-3xl font-bold">
                    {data?.summary?.restartAllowed ?? 0}
                  </p>
                </article>
              </section>

              <section className="rounded-lg border border-white/10 bg-[#111111]/70 p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-xl font-bold tracking-normal">All Services</h2>
                  <span className="text-sm text-white/50">
                    {data?.updatedAt ? new Date(data.updatedAt).toLocaleTimeString() : "Not updated"}
                  </span>
                </div>

                <div className="mb-5 grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
                  <input
                    className="h-11 rounded-md border border-white/10 bg-black/24 px-4 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-[#e95420]"
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search service, description, state..."
                    value={query}
                  />
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {FILTERS.map((item) => (
                      <button
                        className={`h-11 shrink-0 rounded-md px-4 text-sm font-bold transition ${
                          filter === item.value
                            ? "bg-[#e95420] text-white"
                            : "border border-white/10 bg-white/8 text-white/62 hover:bg-white/12"
                        }`}
                        key={item.value}
                        onClick={() => setFilter(item.value)}
                        type="button"
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid gap-3">
                  {isLoading ? (
                    <p className="rounded-md bg-black/20 px-4 py-5 text-sm text-white/58">
                      Loading services...
                    </p>
                  ) : null}

                  {filteredServices.map((service) => (
                    <div
                      className="grid gap-3 rounded-md border border-white/10 bg-white/[0.04] p-4 sm:grid-cols-[1fr_auto_auto] sm:items-center"
                      key={service.name}
                    >
                      <div>
                        <p className="font-bold text-white">{service.name}</p>
                        <p className="mt-1 text-sm text-white/54">
                          {service.description || "No description"}
                        </p>
                        {service.restartAllowed ? (
                          <p className="mt-1 text-xs font-semibold text-[#ffb088]">
                            Restart target: {service.restartTarget}
                          </p>
                        ) : null}
                      </div>
                      <StatusBadge
                        ok={service.ok}
                        state={service.state}
                        subState={service.subState}
                      />
                      {service.restartAllowed ? (
                        <button
                          className="h-10 rounded-md bg-[#e95420] px-4 text-sm font-bold text-white transition hover:bg-[#c34113] disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={Boolean(restarting)}
                          onClick={() => restartService(service.restartTarget)}
                          type="button"
                        >
                          {restarting === service.restartTarget ? "Restarting" : "Restart"}
                        </button>
                      ) : (
                        <span className="rounded-md border border-white/10 px-4 py-2 text-center text-sm font-semibold text-white/42">
                          View only
                        </span>
                      )}
                    </div>
                  ))}
                  {!isLoading && filteredServices.length === 0 ? (
                    <p className="rounded-md bg-black/20 px-4 py-5 text-sm text-white/58">
                      No services match this filter.
                    </p>
                  ) : null}
                </div>
              </section>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
