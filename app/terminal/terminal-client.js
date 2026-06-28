"use client";

import { useCallback, useEffect, useState } from "react";
import AppSidebar, { AppMobileNav } from "@/app/components/app-sidebar";

export default function TerminalClient({ username }) {
  const [allowedCommands, setAllowedCommands] = useState([]);
  const [command, setCommand] = useState("uptime");
  const [cwd, setCwd] = useState("");
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [shellEnabled, setShellEnabled] = useState(false);
  const [shellPath, setShellPath] = useState("");

  const loadTerminal = useCallback(async () => {
    try {
      const response = await fetch("/api/terminal", { cache: "no-store" });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || `Terminal API returned ${response.status}`);
      }

      setAllowedCommands(payload.allowedCommands || []);
      setCwd(payload.cwd || "");
      setShellEnabled(Boolean(payload.shellEnabled));
      setShellPath(payload.shellPath || "");
      setError(null);
    } catch (loadError) {
      setError(loadError.message);
    }
  }, []);

  useEffect(() => {
    const timeout = setTimeout(loadTerminal, 0);

    return () => clearTimeout(timeout);
  }, [loadTerminal]);

  async function runCommand(event) {
    event.preventDefault();

    if (!command.trim()) {
      return;
    }

    setIsRunning(true);

    try {
      const response = await fetch("/api/terminal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ command }),
      });
      const payload = await response.json();

      setHistory((current) => [
        {
          at: new Date().toISOString(),
          command,
          error: response.ok ? "" : payload.error,
          output: payload.output || payload.error || "",
          ok: response.ok,
        },
        ...current,
      ].slice(0, 30));

      if (!response.ok) {
        setError(payload.error || `Terminal command returned ${response.status}`);
      } else {
        setError(null);
      }
    } catch (runError) {
      setError(runError.message);
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#1c1b22] text-white">
      <AppMobileNav activeItem="Terminal" />
      <div className="grid min-h-screen lg:grid-cols-[280px_minmax(0,1fr)]">
        <AppSidebar
          activeItem="Terminal"
          helperText="Runs admin terminal commands with audit logging."
          username={username}
        />

        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_0%,rgba(233,84,32,0.20),transparent_30%),linear-gradient(135deg,rgba(44,0,30,0.58),rgba(17,17,17,0.98)_56%)]" />
          <div className="relative z-10 px-5 py-5 sm:px-8 lg:px-10">
            <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#ffb088]">
                  Terminal
                </p>
                <h1 className="mt-2 text-3xl font-bold tracking-normal">Web Terminal</h1>
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
                  <h2 className="text-xl font-bold tracking-normal">Terminal error</h2>
                  <p className="mt-2 text-sm leading-6 text-white/70">{error}</p>
                </section>
              ) : null}

              <section className="rounded-lg border border-white/10 bg-[#111111]/70 p-5">
                <p className="text-sm text-white/48">Working directory</p>
                <p className="mt-2 break-all font-mono text-sm text-white/74">{cwd || "-"}</p>
                <div className="mt-4 rounded-md border border-[#ffb088]/28 bg-[#ffb088]/10 px-4 py-3 text-sm leading-6 text-white/68">
                  Mode:{" "}
                  <span className="font-bold text-[#ffb088]">
                    {shellEnabled ? `Full shell (${shellPath || "default"})` : "Controlled allowlist"}
                  </span>
                  {shellEnabled
                    ? ". Commands are executed by the server shell and recorded in audit logs."
                    : ". Only allowlisted commands can run."}
                </div>

                <form className="mt-5 grid gap-3 lg:grid-cols-[1fr_auto]" onSubmit={runCommand}>
                  <input
                    className="h-12 rounded-md border border-white/10 bg-black/32 px-4 font-mono text-sm text-white outline-none transition placeholder:text-white/35 focus:border-[#e95420]"
                    onChange={(event) => setCommand(event.target.value)}
                    placeholder={shellEnabled ? "sudo systemctl status nginx" : "uptime"}
                    value={command}
                  />
                  <button
                    className="h-12 rounded-md bg-[#e95420] px-6 text-sm font-bold text-white transition hover:bg-[#c34113] disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={isRunning}
                    type="submit"
                  >
                    {isRunning ? "Running" : "Run"}
                  </button>
                </form>

                {shellEnabled ? (
                  <div className="mt-4 grid gap-2 text-xs text-white/48 sm:grid-cols-2 xl:grid-cols-4">
                    {["uptime", "df -h", "free -h", "systemctl status nginx"].map((item) => (
                      <button
                        className="rounded-md border border-white/10 bg-white/8 px-3 py-2 font-mono text-left text-white/68 transition hover:bg-white/12"
                        key={item}
                        onClick={() => setCommand(item)}
                        type="button"
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {allowedCommands.map((item) => (
                      <button
                        className="rounded-md border border-white/10 bg-white/8 px-3 py-2 font-mono text-xs text-white/68 transition hover:bg-white/12"
                        key={item}
                        onClick={() => setCommand(item)}
                        type="button"
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                )}
              </section>

              <section className="grid gap-4">
                {history.length > 0 ? (
                  history.map((item) => (
                    <article
                      className={`rounded-lg border p-4 ${
                        item.ok
                          ? "border-white/10 bg-black/32"
                          : "border-[#e95420]/45 bg-[#e95420]/14"
                      }`}
                      key={`${item.at}-${item.command}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="font-mono text-sm font-bold text-[#ffb088]">
                          $ {item.command}
                        </p>
                        <p className="text-xs text-white/42">
                          {new Date(item.at).toLocaleString()}
                        </p>
                      </div>
                      <pre className="mt-3 max-h-[460px] overflow-auto whitespace-pre-wrap rounded-md bg-black/35 p-4 font-mono text-xs leading-6 text-white/72">
                        {item.output || "(no output)"}
                      </pre>
                    </article>
                  ))
                ) : (
                  <p className="rounded-md bg-black/20 px-4 py-6 text-center text-sm text-white/58">
                    Run an allowlisted command to see output.
                  </p>
                )}
              </section>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
