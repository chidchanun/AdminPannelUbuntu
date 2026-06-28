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
      const nextCwd = payload.cwd || cwd;

      if (payload.clear) {
        setHistory([]);
        setCommand("");
        setCwd(nextCwd);
        setError(null);
        return;
      }

      setHistory((current) =>
        [
          ...current,
          {
            at: new Date().toISOString(),
            command,
            error: response.ok ? "" : payload.error,
            output: payload.output || payload.error || "",
            ok: response.ok,
            prompt: `${username}:${cwd || "~"}$`,
          },
        ].slice(-60)
      );

      if (nextCwd) {
        setCwd(nextCwd);
      }

      if (!response.ok) {
        setError(payload.error || `Terminal command returned ${response.status}`);
      } else {
        setError(null);
        setCommand("");
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

              <section className="rounded-lg border border-white/10 bg-black/50 p-4">
                <div className="min-h-[52vh] overflow-auto rounded-md bg-black/45 p-4 font-mono text-sm leading-6 text-white/78">
                  {history.length > 0 ? (
                    history.map((item) => (
                      <div className="mb-4" key={`${item.at}-${item.command}`}>
                        <p className={item.ok ? "text-[#ffb088]" : "text-red-300"}>
                          {item.prompt} {item.command}
                        </p>
                        <pre className="mt-1 whitespace-pre-wrap text-white/74">
                          {item.output || "(no output)"}
                        </pre>
                      </div>
                    ))
                  ) : (
                    <p className="text-white/40">SSH-like web terminal ready.</p>
                  )}
                </div>

                <form
                  className="mt-3 grid gap-3 lg:grid-cols-[auto_minmax(0,1fr)_auto]"
                  onSubmit={runCommand}
                >
                  <span className="self-center break-all font-mono text-sm font-bold text-[#ffb088]">
                    {username}:{cwd || "~"}$
                  </span>
                  <input
                    autoFocus
                    className="h-12 rounded-md border border-white/10 bg-black/32 px-4 font-mono text-sm text-white outline-none transition placeholder:text-white/35 focus:border-[#e95420]"
                    onChange={(event) => setCommand(event.target.value)}
                    placeholder={shellEnabled ? "type a command like SSH" : "uptime"}
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
              </section>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
