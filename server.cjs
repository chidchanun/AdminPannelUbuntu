const { createServer } = require("node:http");
const { execFile } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const next = require("next");
const { WebSocketServer, WebSocket } = require("ws");
const pty = require("node-pty");

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = Number(process.env.PORT || 3000);

const app = next({
  dev,
  hostname,
  port,
});

const handle = app.getRequestHandler();

function sendUpgradeError(socket, statusCode, message) {
  socket.write(
    `HTTP/1.1 ${statusCode} ${message}\r\n` +
      "Connection: close\r\n" +
      "Content-Type: text/plain\r\n" +
      `Content-Length: ${Buffer.byteLength(message)}\r\n` +
      "\r\n" +
      message
  );

  socket.destroy();
}

async function verifyTerminalAccess(req) {
  const cookie = req.headers.cookie || "";

  const response = await fetch(`http://127.0.0.1:${port}/api/terminal`, {
    method: "GET",
    headers: {
      cookie,
    },
  });

  if (!response.ok) {
    return null;
  }

  return response.json();
}

function getDockerTerminalArgs(containerName) {
  const image = process.env.TERMINAL_CONTAINER_IMAGE || "admin-panel-terminal:chidchanun";
  const username = process.env.TERMINAL_CONTAINER_USERNAME || "ChidchanunServer";
  const homeDir = process.env.TERMINAL_CONTAINER_HOME || `/home/${username}`;
  const mountDir = process.env.TERMINAL_CONTAINER_MOUNT || homeDir;
  const network = process.env.TERMINAL_CONTAINER_NETWORK || "none";

  return [
    "run",
    "--rm",
    "-i",
    "-t",

    "--name",
    containerName,

    "--hostname",
    "ubuntu",

    "--network",
    network,

    "--workdir",
    homeDir,

    "--user",
    `${process.getuid?.() || 1000}:${process.getgid?.() || 1000}`,

    "--mount",
    `type=bind,source=${mountDir},target=${homeDir}`,

    "--read-only",
    "--tmpfs",
    "/tmp:rw,nosuid,nodev,noexec,size=128m",
    "--tmpfs",
    "/run:rw,nosuid,nodev,noexec,size=64m",

    "--cap-drop",
    "ALL",

    "--security-opt",
    "no-new-privileges",

    "--pids-limit",
    "256",

    "--memory",
    "512m",

    "--cpus",
    "1",

    "-e",
    "TERM=xterm-256color",

    "-e",
    `USER=${username}`,

    "-e",
    `HOME=${homeDir}`,

    image,

    "/bin/bash",
    "-l",
  ];
}

app.prepare().then(() => {
  const server = createServer((req, res) => {
    handle(req, res);
  });

  const wss = new WebSocketServer({
    noServer: true,
  });

  server.on("upgrade", async (req, socket, head) => {
    try {
      const url = new URL(req.url || "", `http://${req.headers.host}`);

      if (url.pathname !== "/api/terminal/pty") {
        if (!dev) {
          socket.destroy();
        }

        return;
      }

      const terminalInfo = await verifyTerminalAccess(req);

      if (!terminalInfo) {
        sendUpgradeError(socket, 403, "Terminal permission denied.");
        return;
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req, terminalInfo);
      });
    } catch (error) {
      console.error("WebSocket upgrade failed:", error);
      sendUpgradeError(socket, 500, "WebSocket upgrade failed.");
    }
  });

  wss.on("connection", (ws) => {
    const containerName = `admin-panel-terminal-${randomUUID()
      .replaceAll("-", "")
      .slice(0, 16)}`;

    const dockerArgs = getDockerTerminalArgs(containerName);

    const ptyProcess = pty.spawn("docker", dockerArgs, {
      name: "xterm-256color",
      cols: 120,
      rows: 34,
      cwd: process.env.TERMINAL_CONTAINER_MOUNT || "/home/ChidchanunServer",
      env: {
        ...process.env,
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
      },
    });

    console.log(`[PTY] Docker terminal started: ${containerName}`);

    ptyProcess.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "output",
            data,
          })
        );
      }
    });

    ws.on("message", (message) => {
      try {
        const payload = JSON.parse(message.toString());

        if (payload.type === "input") {
          ptyProcess.write(String(payload.data || ""));
          return;
        }

        if (payload.type === "resize") {
          const cols = Number(payload.cols || 120);
          const rows = Number(payload.rows || 34);

          if (cols > 0 && rows > 0) {
            ptyProcess.resize(cols, rows);
          }
        }
      } catch (error) {
        console.error("PTY message error:", error);
      }
    });

    function cleanupContainer() {
      try {
        ptyProcess.kill();
      } catch {
        // ignore
      }

      execFile("docker", ["rm", "-f", containerName], () => {
        console.log(`[PTY] Docker terminal removed: ${containerName}`);
      });
    }

    ws.on("close", cleanupContainer);

    ws.on("error", (error) => {
      console.error("PTY websocket error:", error);
      cleanupContainer();
    });
  });

  server.listen(port, hostname, () => {
    console.log(`Ready on http://${hostname}:${port}`);
    console.log(`PTY WebSocket ready on ws://${hostname}:${port}/api/terminal/pty`);
  });
});