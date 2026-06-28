"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AppSidebar, { AppMobileNav } from "@/app/components/app-sidebar";

export default function TerminalClient({ username }) {
  const terminalElementRef = useRef(null);
  const terminalRef = useRef(null);
  const fitAddonRef = useRef(null);
  const socketRef = useRef(null);

  const [status, setStatus] = useState("connecting");
  const [error, setError] = useState("");

  const resizeTerminal = useCallback(() => {
    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    const socket = socketRef.current;

    if (!terminal || !fitAddon) {
      return;
    }

    try {
      fitAddon.fit();

      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({
            type: "resize",
            cols: terminal.cols,
            rows: terminal.rows,
          })
        );
      }
    } catch {
      // ignore resize error
    }
  }, []);

  const runQuickCommand = useCallback((command) => {
    const socket = socketRef.current;
    const terminal = terminalRef.current;

    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({
          type: "input",
          data: `${command}\r`,
        })
      );

      terminal?.focus();
    }
  }, []);

  useEffect(() => {
    let disposed = false;

    async function startTerminal() {
      try {
        const [{ Terminal }, { FitAddon }] = await Promise.all([
          import("@xterm/xterm"),
          import("@xterm/addon-fit"),
        ]);

        if (disposed || !terminalElementRef.current) {
          return;
        }

        const terminal = new Terminal({
          cursorBlink: true,
          cursorStyle: "block",
          fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
          fontSize: 14,
          lineHeight: 1.25,
          scrollback: 5000,
          convertEol: false,
          allowProposedApi: true,
          theme: {
            background: "#300a24",
            foreground: "#eeeeec",
            cursor: "#eeeeec",
            selectionBackground: "#75507b",
            black: "#2e3436",
            red: "#cc0000",
            green: "#4e9a06",
            yellow: "#c4a000",
            blue: "#3465a4",
            magenta: "#75507b",
            cyan: "#06989a",
            white: "#d3d7cf",
            brightBlack: "#555753",
            brightRed: "#ef2929",
            brightGreen: "#8ae234",
            brightYellow: "#fce94f",
            brightBlue: "#729fcf",
            brightMagenta: "#ad7fa8",
            brightCyan: "#34e2e2",
            brightWhite: "#eeeeec",
          },
        });

        const fitAddon = new FitAddon();

        terminal.loadAddon(fitAddon);
        terminal.open(terminalElementRef.current);

        terminalRef.current = terminal;
        fitAddonRef.current = fitAddon;

        terminal.writeln("Connecting to Ubuntu terminal...");
        terminal.writeln("");

        const protocol = window.location.protocol === "https:" ? "wss" : "ws";
        const socket = new WebSocket(
          `${protocol}://${window.location.host}/api/terminal/pty`
        );

        socketRef.current = socket;

        socket.addEventListener("open", () => {
          if (disposed) {
            return;
          }

          setStatus("connected");
          setError("");

          terminal.clear();
          resizeTerminal();
          terminal.focus();
        });

        socket.addEventListener("message", (event) => {
          try {
            const payload = JSON.parse(event.data);

            if (payload.type === "output") {
              terminal.write(payload.data);
            }
          } catch {
            terminal.write(String(event.data));
          }
        });

        socket.addEventListener("close", () => {
          if (disposed) {
            return;
          }

          setStatus("disconnected");
          terminal.writeln("");
          terminal.writeln("\x1b[31mConnection closed.\x1b[0m");
        });

        socket.addEventListener("error", () => {
          if (disposed) {
            return;
          }

          setStatus("error");
          setError("Cannot connect to PTY WebSocket.");
          terminal.writeln("");
          terminal.writeln("\x1b[31mWebSocket connection error.\x1b[0m");
        });

        terminal.onData((data) => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(
              JSON.stringify({
                type: "input",
                data,
              })
            );
          }
        });

        window.addEventListener("resize", resizeTerminal);

        setTimeout(() => {
          resizeTerminal();
          terminal.focus();
        }, 100);
      } catch (startError) {
        setStatus("error");
        setError(startError.message || "Failed to start terminal.");
      }
    }

    startTerminal();

    return () => {
      disposed = true;

      window.removeEventListener("resize", resizeTerminal);

      try {
        socketRef.current?.close();
      } catch {
        // ignore
      }

      try {
        terminalRef.current?.dispose();
      } catch {
        // ignore
      }

      socketRef.current = null;
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [resizeTerminal]);

  return (
    <main className="min-h-screen bg-[#1e1e1e] text-white">
      <AppMobileNav activeItem="Terminal" />

      <div className="grid min-h-screen lg:grid-cols-[280px_minmax(0,1fr)]">
        <AppSidebar
          activeItem="Terminal"
          helperText="Interactive Ubuntu terminal with PTY support."
          username={username}
        />

        <section className="flex min-h-screen items-center justify-center bg-[#2c001e] p-4 sm:p-6 lg:p-8">
          <div className="w-full max-w-7xl overflow-hidden rounded-lg border border-black/40 bg-[#300a24] shadow-2xl">
            <div className="flex h-10 items-center justify-between bg-[#3d3d3d] px-3">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
                <span className="h-3 w-3 rounded-full bg-[#ffbd2e]" />
                <span className="h-3 w-3 rounded-full bg-[#28c840]" />
              </div>

              <div className="select-none text-sm font-semibold text-white/85">
                {username || "ubuntu"}@ubuntu: Interactive Terminal
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

            <div className="border-b border-white/10 bg-[#2a0820] px-4 py-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-white/60">
                  Status:{" "}
                  <span
                    className={
                      status === "connected"
                        ? "font-semibold text-[#8ae234]"
                        : status === "error"
                          ? "font-semibold text-[#ef2929]"
                          : "font-semibold text-[#fce94f]"
                    }
                  >
                    {status}
                  </span>

                  {error ? (
                    <span className="ml-3 text-[#ef2929]">{error}</span>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  {["pwd", "ls -la", "pm2 list", "df -h", "free -h"].map(
                    (item) => (
                      <button
                        className="rounded border border-white/10 bg-white/5 px-2 py-1 font-mono text-xs text-white/70 transition hover:bg-white/10 hover:text-white"
                        key={item}
                        onClick={() => runQuickCommand(item)}
                        type="button"
                      >
                        {item}
                      </button>
                    )
                  )}
                </div>
              </div>
            </div>

            <div
              className="h-[calc(100vh-132px)] min-h-[560px] bg-[#300a24] p-2"
              onClick={() => terminalRef.current?.focus()}
            >
              <div ref={terminalElementRef} className="h-full w-full" />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}