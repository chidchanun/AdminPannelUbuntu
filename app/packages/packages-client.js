"use client";

import { useCallback, useEffect, useState } from "react";
import AppSidebar, { AppMobileNav } from "@/app/components/app-sidebar";

function OutputBlock({ output }) {
  if (!output) {
    return null;
  }

  return (
    <pre className="max-h-[420px] overflow-auto rounded-md border border-white/10 bg-black/42 p-4 font-mono text-xs leading-6 text-white/72">
      {output}
    </pre>
  );
}

export default function PackagesClient({ username }) {
  const [allowAny, setAllowAny] = useState(false);
  const [allowlist, setAllowlist] = useState([]);
  const [error, setError] = useState(null);
  const [installOutput, setInstallOutput] = useState("");
  const [isInstalling, setIsInstalling] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [packageInput, setPackageInput] = useState("");
  const [packages, setPackages] = useState([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState(null);

  const loadPackages = useCallback(async ({ packageName = packageInput, search = query } = {}) => {
    setIsSearching(true);

    try {
      const params = new URLSearchParams();

      if (search.trim()) {
        params.set("q", search.trim());
      }

      if (packageName.trim()) {
        params.set("package", packageName.trim());
      }

      const response = await fetch(`/api/packages?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || `Packages API returned ${response.status}`);
      }

      setAllowAny(Boolean(payload.allowAny));
      setAllowlist(payload.allowlist || []);
      setPackages(payload.packages || []);
      setStatus(payload.status || null);
      setError(payload.error || null);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setIsSearching(false);
    }
  }, [packageInput, query]);

  useEffect(() => {
    const timeout = setTimeout(() => loadPackages({ packageName: "", search: "" }), 0);

    return () => clearTimeout(timeout);
  }, [loadPackages]);

  async function searchPackages(event) {
    event.preventDefault();
    await loadPackages();
  }

  async function installPackage() {
    const packageName = packageInput.trim();

    if (!packageName) {
      setError("Package name is required.");
      return;
    }

    if (!window.confirm(`Install package "${packageName}" on this server?`)) {
      return;
    }

    setIsInstalling(true);
    setInstallOutput("");

    try {
      const response = await fetch("/api/packages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          package: packageName,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || `Install returned ${response.status}`);
      }

      setInstallOutput(payload.output || "Install completed.");
      setError(null);
      await loadPackages({ packageName, search: query });
    } catch (installError) {
      setError(installError.message);
      setInstallOutput(installError.output || "");
    } finally {
      setIsInstalling(false);
    }
  }

  function selectPackage(packageName) {
    setPackageInput(packageName);
    loadPackages({ packageName, search: query });
  }

  return (
    <main className="min-h-screen bg-[#1c1b22] text-white">
      <AppMobileNav activeItem="Packages" />
      <div className="grid min-h-screen lg:grid-cols-[280px_minmax(0,1fr)]">
        <AppSidebar
          activeItem="Packages"
          helperText="Install packages through controlled apt actions."
          username={username}
        />

        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_0%,rgba(233,84,32,0.20),transparent_30%),linear-gradient(135deg,rgba(44,0,30,0.58),rgba(17,17,17,0.98)_56%)]" />

          <div className="relative z-10 px-5 py-5 sm:px-8 lg:px-10">
            <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#ffb088]">
                  Packages
                </p>
                <h1 className="mt-2 text-3xl font-bold tracking-normal">Package Installer</h1>
              </div>
              <form action="/api/logout" method="post">
                <button
                  className="h-10 rounded-md border border-white/14 px-4 text-sm font-semibold text-white transition hover:bg-white/10"
                  type="submit"
                >
                  Logout
                </button>
              </form>
            </header>

            <div className="grid gap-5 py-7">
              {error ? (
                <section className="rounded-lg border border-[#e95420]/50 bg-[#e95420]/14 p-5">
                  <h2 className="text-xl font-bold tracking-normal">Package error</h2>
                  <p className="mt-2 text-sm leading-6 text-white/70">{error}</p>
                </section>
              ) : null}

              <section className="rounded-lg border border-white/10 bg-[#111111]/70 p-5">
                <form className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_auto]" onSubmit={searchPackages}>
                  <input
                    className="h-11 rounded-md border border-white/10 bg-black/24 px-4 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-[#e95420]"
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search apt packages"
                    value={query}
                  />
                  <input
                    className="h-11 rounded-md border border-white/10 bg-black/24 px-4 font-mono text-sm text-white outline-none transition placeholder:text-white/35 focus:border-[#e95420]"
                    onChange={(event) => setPackageInput(event.target.value)}
                    placeholder="package-name"
                    value={packageInput}
                  />
                  <button
                    className="h-11 rounded-md border border-white/14 px-5 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={isSearching}
                    type="submit"
                  >
                    {isSearching ? "Searching" : "Search"}
                  </button>
                </form>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-white/58">
                  <p>
                    Install policy:{" "}
                    <span className={allowAny ? "text-[#ffb088]" : "text-emerald-200"}>
                      {allowAny ? "any valid package" : "allowlist only"}
                    </span>
                  </p>
                  <button
                    className="h-10 rounded-md bg-[#e95420] px-4 text-sm font-bold text-white transition hover:bg-[#c34113] disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={isInstalling || !packageInput.trim()}
                    onClick={installPackage}
                    type="button"
                  >
                    {isInstalling ? "Installing" : "Install Package"}
                  </button>
                </div>

                {!allowAny && allowlist.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {allowlist.map((item) => (
                      <button
                        className="rounded-md border border-white/10 bg-white/8 px-3 py-2 font-mono text-sm text-white/72 transition hover:bg-white/12"
                        key={item}
                        onClick={() => selectPackage(item)}
                        type="button"
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                ) : null}
              </section>

              {status ? (
                <section className="rounded-lg border border-white/10 bg-white/[0.05] p-5">
                  <h2 className="text-xl font-bold tracking-normal">Selected Package</h2>
                  <div className="mt-3 grid gap-2 text-sm text-white/62">
                    <p>
                      Status:{" "}
                      <span className={status.installed ? "text-emerald-200" : "text-[#ffb088]"}>
                        {status.status}
                      </span>
                    </p>
                    <p>Version: {status.version || "-"}</p>
                  </div>
                </section>
              ) : null}

              <OutputBlock output={installOutput} />

              <section className="rounded-lg border border-white/10 bg-[#111111]/70 p-5">
                <h2 className="text-xl font-bold tracking-normal">Search Results</h2>
                <div className="mt-5 grid gap-3">
                  {packages.length > 0 ? (
                    packages.map((item) => (
                      <button
                        className="rounded-md border border-white/10 bg-black/20 p-4 text-left transition hover:bg-white/8"
                        key={`${item.name}-${item.description}`}
                        onClick={() => selectPackage(item.name)}
                        type="button"
                      >
                        <p className="font-mono text-sm font-bold text-white/82">{item.name}</p>
                        <p className="mt-2 text-sm leading-6 text-white/56">
                          {item.description || "-"}
                        </p>
                      </button>
                    ))
                  ) : (
                    <p className="rounded-md bg-black/20 px-4 py-6 text-center text-sm text-white/58">
                      Search for a package to see results.
                    </p>
                  )}
                </div>
              </section>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
