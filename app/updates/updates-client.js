"use client";

import { useCallback, useEffect, useState } from "react";
import AppSidebar, { AppMobileNav } from "@/app/components/app-sidebar";

function SummaryCard({ label, value, tone = "neutral" }) {
  const className =
    tone === "critical"
      ? "border-[#e95420]/45 bg-[#e95420]/14 text-[#ffb088]"
      : tone === "warning"
        ? "border-[#ffb088]/28 bg-[#ffb088]/10 text-[#ffd1bd]"
        : "border-white/10 bg-white/[0.05] text-white";

  return (
    <article className={`rounded-lg border p-5 ${className}`}>
      <p className="text-sm font-bold uppercase tracking-[0.16em] opacity-70">{label}</p>
      <p className="mt-3 text-3xl font-bold tracking-normal">{value}</p>
    </article>
  );
}

export default function UpdatesClient({ username }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [upgradeOutput, setUpgradeOutput] = useState("");

  const loadUpdates = useCallback(async () => {
    setIsLoading(true);

    try {
      const response = await fetch("/api/updates", { cache: "no-store" });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || `Updates API returned ${response.status}`);
      }

      setData(payload);
      setError(payload.error || null);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = setTimeout(loadUpdates, 0);

    return () => clearTimeout(timeout);
  }, [loadUpdates]);

  async function runUpdateUpgrade() {
    if (!window.confirm("Run apt-get update and apt-get upgrade -y on this server?")) {
      return;
    }

    setIsUpgrading(true);
    setUpgradeOutput("");

    try {
      const response = await fetch("/api/updates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "update-upgrade" }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || `Upgrade returned ${response.status}`);
      }

      setUpgradeOutput(payload.output || "Update and upgrade completed.");
      setError(null);
      await loadUpdates();
    } catch (upgradeError) {
      setError(upgradeError.message);
    } finally {
      setIsUpgrading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#1c1b22] text-white">
      <AppMobileNav activeItem="Updates" />
      <div className="grid min-h-screen lg:grid-cols-[280px_minmax(0,1fr)]">
        <AppSidebar
          activeItem="Updates"
          helperText="Review available Ubuntu package updates before running upgrades."
          username={username}
        />

        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_0%,rgba(233,84,32,0.20),transparent_30%),linear-gradient(135deg,rgba(44,0,30,0.58),rgba(17,17,17,0.98)_56%)]" />
          <div className="relative z-10 px-5 py-5 sm:px-8 lg:px-10">
            <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#ffb088]">
                  Updates
                </p>
                <h1 className="mt-2 text-3xl font-bold tracking-normal">Ubuntu Update Center</h1>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  className="h-10 rounded-md border border-white/14 px-4 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isLoading || isUpgrading}
                  onClick={loadUpdates}
                  type="button"
                >
                  Refresh
                </button>
                <button
                  className="h-10 rounded-md bg-[#e95420] px-4 text-sm font-bold text-white transition hover:bg-[#c34113] disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isUpgrading}
                  onClick={runUpdateUpgrade}
                  type="button"
                >
                  {isUpgrading ? "Upgrading" : "Update + Upgrade"}
                </button>
              </div>
            </header>

            <div className="grid gap-5 py-7">
              {error ? (
                <section className="rounded-lg border border-[#e95420]/50 bg-[#e95420]/14 p-5">
                  <h2 className="text-xl font-bold tracking-normal">Update check error</h2>
                  <p className="mt-2 text-sm leading-6 text-white/70">{error}</p>
                </section>
              ) : null}

              {isLoading || !data ? (
                <p className="rounded-md bg-black/20 px-4 py-5 text-sm text-white/58">
                  Checking package updates...
                </p>
              ) : (
                <>
                  <section className="grid gap-4 md:grid-cols-3">
                    <SummaryCard label="Packages" value={data.summary.packages} />
                    <SummaryCard
                      label="Security"
                      tone={data.summary.security > 0 ? "critical" : "neutral"}
                      value={data.summary.security}
                    />
                    <SummaryCard
                      label="Reboot"
                      tone={data.rebootRequired ? "warning" : "neutral"}
                      value={data.rebootRequired ? "Required" : "No"}
                    />
                  </section>

                  {data.rebootPackages?.length > 0 ? (
                    <section className="rounded-lg border border-[#ffb088]/28 bg-[#ffb088]/10 p-5">
                      <h2 className="text-xl font-bold tracking-normal">Reboot Required</h2>
                      <p className="mt-2 text-sm leading-6 text-white/62">
                        Packages requesting reboot: {data.rebootPackages.join(", ")}
                      </p>
                    </section>
                  ) : null}

                  {upgradeOutput ? (
                    <pre className="max-h-[480px] overflow-auto rounded-lg border border-white/10 bg-black/42 p-4 font-mono text-xs leading-6 text-white/72">
                      {upgradeOutput}
                    </pre>
                  ) : null}

                  <section className="rounded-lg border border-white/10 bg-[#111111]/70 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h2 className="text-xl font-bold tracking-normal">Upgradable Packages</h2>
                      <p className="text-sm text-white/48">
                        Checked {new Date(data.checkedAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="mt-5 overflow-x-auto">
                      <table className="w-full min-w-[720px] text-left text-sm">
                        <thead className="text-white/48">
                          <tr>
                            <th className="border-b border-white/10 px-3 py-3">Package</th>
                            <th className="border-b border-white/10 px-3 py-3">Current</th>
                            <th className="border-b border-white/10 px-3 py-3">Target</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(data.packages || []).map((item) => (
                            <tr className="border-b border-white/5" key={item.raw}>
                              <td className="px-3 py-3 font-semibold text-white/82">{item.name}</td>
                              <td className="px-3 py-3 text-white/58">{item.current || "-"}</td>
                              <td className="px-3 py-3 text-white/58">{item.target || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {data.packages?.length === 0 ? (
                        <p className="rounded-md bg-black/20 px-4 py-6 text-center text-sm text-white/58">
                          No package updates found.
                        </p>
                      ) : null}
                    </div>
                  </section>
                </>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
