"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

  const terminalRef = useRef(null);

  const formatLinuxPath = useCallback(
    (path) => {
      if (!path) return "~";

      const safeUsername = username || "ubuntu";
      const homePath = `/home/${safeUsername}`;

      if (path === homePath) return "~";

      if (path.startsWith(`${homePath}/`)) {
        return path.replace(homePath, "~");
      }

      return path;
    },
    [username]
  );

  const getPrompt = useCallback(
    (path) => `${username || "ubuntu"}@ubuntu:${formatLinuxPath(path)}$`,
    [username, formatLinuxPath]
  );

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

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [history, error, isRunning]);

  async function runCommand(event) {
    event.preventDefault();

    if (!command.trim()) {
      return;
    }

    const currentCommand = command.trim();
    const currentPrompt = getPrompt(cwd);

    setIsRunning(true);

    try {
      const response = await fetch("/api/terminal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ command: currentCommand }),
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
            command: currentCommand,
            error: response.ok ? "" : payload.error,
            output: payload.output || payload.error || "",
            ok: response.ok,
            prompt: currentPrompt,
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

  const quickCommands = shellEnabled
    ? ["uptime", "df -h", "free -h", "systemctl status nginx"]
    : allowedCommands;

  return (
    <main className="min-h-screen bg-[#1e1e1e] text-white">
      <AppMobileNav activeItem="Terminal" />

      <div className="grid min-h-screen lg:grid-cols-[280px_minmax(0,1fr)]">
        <AppSidebar
          activeItem="Terminal"
          helperText="Ubuntu terminal command runner with audit logging."
          username={username}
        />

        <section className="flex min-h-screen items-center justify-center bg-[#2c001e] p-4 sm:p-6 lg:p-8">
          <div className="w-full max-w-6xl overflow-hidden rounded-lg border border-black/40 bg-[#300a24] shadow-2xl">
            <div className="flex h-10 items-center justify-between bg-[#3d3d3d] px-3">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
                <span className="h-3 w-3 rounded-full bg-[#ffbd2e]" />
                <span className="h-3 w-3 rounded-full bg-[#28c840]" />
              </div>

              <div className="select-none text-sm font-semibold text-white/85">
                {username || "ubuntu"}@ubuntu: {formatLinuxPath(cwd)}
              </div>

              <form action="/api/logout" method="post">
                <button
                  className="rounded px-3 py-1 text-xs font-semibold text-white/70 transition hover:bg-white/10 hover:text-white"
                  type="submit"
                >
                  Logout
                </button>
              </form>
            </div>

            <div
              ref={terminalRef}
              className="h-[calc(100vh-110px)] min-h-[560px] overflow-auto bg-[#300a24] p-4 font-mono text-sm leading-6 text-[#eeeeec]"
            >
              <p className="text-[#eeeeec]">
                Welcome to Ubuntu Terminal
              </p>

              <p className="text-[#eeeeec]/70">
                Current shell mode:{" "}
                <span className="text-[#fce94f]">
                  {shellEnabled
                    ? `Full shell (${shellPath || "default"})`
                    : "Controlled allowlist"}
                </span>
              </p>

              {quickCommands.length > 0 ? (
                <>
                  <br />
                  <p className="text-[#eeeeec]/70">Quick commands:</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {quickCommands.map((item) => (
                      <button
                        className="font-mono text-[#729fcf] underline-offset-2 hover:text-[#8cc4ff] hover:underline"
                        key={item}
                        onClick={() => setCommand(item)}
                        type="button"
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </>
              ) : null}

              {error ? (
                <>
                  <br />
                  <p className="text-[#ef2929]">terminal error: {error}</p>
                </>
              ) : null}

              <br />

              {history.length > 0 ? (
                history.map((item) => (
                  <div className="mb-3" key={`${item.at}-${item.command}`}>
                    <p>
                      <span className="font-bold text-[#8ae234]">
                        {item.prompt}
                      </span>{" "}
                      <span className="text-[#eeeeec]">{item.command}</span>
                    </p>

                    <pre
                      className={`mt-1 whitespace-pre-wrap font-mono ${
                        item.ok ? "text-[#eeeeec]" : "text-[#ef2929]"
                      }`}
                    >
                      {item.output || "(no output)"}
                    </pre>
                  </div>
                ))
              ) : (
                <p className="text-[#eeeeec]/60">
                  Type a command and press Enter.
                </p>
              )}

              <form className="mt-2 flex items-center gap-2" onSubmit={runCommand}>
                <span className="shrink-0 font-bold text-[#8ae234]">
                  {getPrompt(cwd)}
                </span>

                <input
                  autoFocus
                  className="min-w-0 flex-1 border-none bg-transparent font-mono text-[#eeeeec] caret-white outline-none disabled:opacity-60"
                  disabled={isRunning}
                  onChange={(event) => setCommand(event.target.value)}
                  spellCheck={false}
                  value={command}
                />

                {isRunning ? (
                  <span className="animate-pulse text-[#fce94f]">
                    running...
                  </span>
                ) : null}
              </form>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}