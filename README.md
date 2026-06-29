# Ubuntu Admin Panel

Next.js admin panel for managing an Ubuntu server from a browser. It uses the same Linux user/password through PAM, then shows server status, services, security events, files, editor, audit logs, settings, system users, package updates, PM2 logs, and a web terminal.

The recommended terminal mode uses `xterm.js` in the browser, WebSocket transport, `node-pty`, and a Docker sandbox. This allows interactive programs such as `nano`, `vim`, and `top` while limiting the terminal to a mounted workspace such as `/home/ChidchanunServer` instead of exposing the host root filesystem directly.

## Features

- PAM login with Ubuntu server users
- Optional TOTP two-factor authentication after Ubuntu password login
- Dashboard with CPU, RAM, disk, temperature, notices, and service health
- Connections page for active IPs and connection activity
- File browser with file/folder icons, create file, create folder, and web editor
- File version restore from editor backups
- Services page with filtering, detail logs, and start/stop/restart/enable/disable actions
- Security guard for suspicious path scans, high-rate requests, manual blocks, whitelist, and optional UFW block
- Security tuning for path scan, rate limit, port spread, and SSH failure thresholds
- Audit log for admin actions
- Settings page for service allowlists, security toggles, whitelist, alert webhooks, 2FA, audit retention, and JSON backup/restore
- Users page for `/etc/passwd`, active shell sessions, and recent failed SSH logins
- Notification center for audit, security, and health notices
- HTTP/TCP health checks for local apps and server ports
- PM2 process and log views for apps running on the same server
- System backup/restore for admin settings, security blocks, and optional health history/audit export
- Ubuntu Update Center for package update, security update, and reboot-required visibility
- Controlled package installer for apt packages with allowlist support
- Interactive Ubuntu-style Web Terminal using `xterm.js`, WebSocket, `node-pty`, and an optional Docker sandbox

## Requirements

- Ubuntu server for production use
- Node.js supported by Next.js 16
- `systemctl`, `ss`, `journalctl`, and `who` for full server monitoring
- `authenticate-pam` installed on the Ubuntu server for PAM login
- Optional: `ufw` and sudo permissions for firewall blocking
- Recommended for interactive Web Terminal: Docker, `ws`, `node-pty`, `@xterm/xterm`, and `@xterm/addon-fit`

## Setup

```bash
npm install
npm install authenticate-pam
npm install ws node-pty @xterm/xterm @xterm/addon-fit
cp .env.example .env.local
npm run dev
```

If `node-pty` or `authenticate-pam` fails to build, install native build tools:

```bash
sudo apt update
sudo apt install -y build-essential python3 make g++
npm install
```

If you do not have `.env.example`, create `.env.local` with the values you need:

```bash
AUTH_SECRET=change-this-long-random-secret
LOGIN_ALLOWED_USERS=yourUbuntuUser
ADMIN_USERS=yourUbuntuUser
PAM_SERVICE=nextjs
FILE_BROWSER_ROOT=/home
AUTH_COOKIE_SECURE=false
HEALTH_CHECK_URLS=App|http://127.0.0.1:3000,API|http://127.0.0.1:8080/health
HEALTH_CHECK_PORTS=SSH|127.0.0.1:22,MySQL|127.0.0.1:3306

# Recommended Docker sandbox terminal
TERMINAL_CONTAINER_IMAGE=admin-panel-terminal:chidchanun
TERMINAL_CONTAINER_USERNAME=ChidchanunServer
TERMINAL_CONTAINER_HOME=/home/ChidchanunServer
TERMINAL_CONTAINER_MOUNT=/home/ChidchanunServer
TERMINAL_CONTAINER_NETWORK=none
```

Use `AUTH_COOKIE_SECURE=true` when serving through HTTPS.

## PAM

The app authenticates with Ubuntu through PAM. On the server, install the native package:

```bash
npm install authenticate-pam
```

Create `/etc/pam.d/nextjs` if you use the default `PAM_SERVICE=nextjs`:

```text
auth    include common-auth
account include common-account
```

Only users listed in `LOGIN_ALLOWED_USERS` can log in.

## Two-Factor Authentication

Two-factor authentication can be enabled per signed-in admin user from Settings. Add the generated manual secret or otpauth URI to an authenticator app, verify the 6-digit code, then future logins for that user require both the Ubuntu password and TOTP code.

This works with authenticator apps that support TOTP, including Microsoft Authenticator, Google Authenticator, 1Password, and Bitwarden Authenticator.

## Permissions

Some actions require the Node process user to have Linux permissions:

- Reading files depends on normal filesystem permissions.
- Writing files requires the app user to own the target files or have write access.
- Restarting services or UFW blocking usually needs sudo/polkit configuration.
- Running the Docker sandbox terminal requires permission to run Docker.

Example sudoers entries, adjust usernames and service names before using:

```text
ubuntu-admin ALL=(root) NOPASSWD: /bin/systemctl restart nginx.service, /bin/systemctl start nginx.service, /bin/systemctl stop nginx.service
ubuntu-admin ALL=(root) NOPASSWD: /usr/sbin/ufw deny from *
ubuntu-admin ALL=(root) NOPASSWD: /usr/sbin/ufw delete deny from *
```

For Docker terminal access, the user running the app must be able to run `docker`. On a single-user admin server this can be done with:

```bash
sudo usermod -aG docker ChidchanunServer
```

Then log out and log back in, or restart the service session. Be careful: membership in the `docker` group is powerful and should be treated as root-equivalent on the host.

## Interactive Web Terminal

The recommended terminal stack is:

```text
Browser xterm.js
  -> WebSocket /api/terminal/pty
  -> node-pty
  -> docker run --rm -it ...
  -> /bin/bash inside the sandbox container
```

This mode supports interactive programs such as:

```bash
nano proxy.js
vim .env.production
top
htop
```

The Docker sandbox mounts only the configured host directory, usually:

```bash
/home/ChidchanunServer
```

Inside the container, the user sees `/home/ChidchanunServer` as the writable workspace. Running `cd /` shows the container root filesystem, not the host root filesystem.

### Terminal environment variables

```bash
TERMINAL_CONTAINER_IMAGE=admin-panel-terminal:chidchanun
TERMINAL_CONTAINER_USERNAME=ChidchanunServer
TERMINAL_CONTAINER_HOME=/home/ChidchanunServer
TERMINAL_CONTAINER_MOUNT=/home/ChidchanunServer
TERMINAL_CONTAINER_NETWORK=none
```

Use `TERMINAL_CONTAINER_NETWORK=bridge` only when the terminal needs network access for commands such as `git clone`, `npm install`, or `curl`.

### Legacy non-interactive terminal mode

If you do not want the interactive terminal, keep the controlled allowlist mode instead:

```bash
TERMINAL_ALLOW_SHELL=false
TERMINAL_ALLOWED_COMMANDS=uptime,df,free,who,pm2,systemctl,journalctl,ls,pwd
```

The old `fetch + exec` terminal is suitable for one-shot commands such as `ls`, `pwd`, and `pm2 list`, but it cannot run `nano`, `vim`, `top`, or other TTY programs.

## Dockerfile.terminal

For the recommended sandbox, create `Dockerfile.terminal` in the project root:

```dockerfile
FROM ubuntu:24.04

ARG USERNAME=ChidchanunServer
ARG UID=1000
ARG GID=1000

ENV DEBIAN_FRONTEND=noninteractive
ENV TERM=xterm-256color

RUN apt-get update && apt-get install -y \
    bash \
    nano \
    vim \
    less \
    procps \
    htop \
    iproute2 \
    iputils-ping \
    curl \
    git \
    ca-certificates \
    locales \
    nodejs \
    npm \
    passwd \
    && rm -rf /var/lib/apt/lists/*

RUN set -eux; \
    if getent group "${GID}" >/dev/null; then \
      OLD_GROUP="$(getent group "${GID}" | cut -d: -f1)"; \
      if [ "${OLD_GROUP}" != "${USERNAME}" ]; then \
        groupmod -n "${USERNAME}" "${OLD_GROUP}" || true; \
      fi; \
    else \
      groupadd --gid "${GID}" "${USERNAME}"; \
    fi; \
    if getent passwd "${UID}" >/dev/null; then \
      OLD_USER="$(getent passwd "${UID}" | cut -d: -f1)"; \
      if [ "${OLD_USER}" != "${USERNAME}" ]; then \
        usermod \
          --login "${USERNAME}" \
          --home "/home/${USERNAME}" \
          --move-home \
          --shell /bin/bash \
          "${OLD_USER}"; \
      fi; \
      usermod --gid "${GID}" "${USERNAME}"; \
    else \
      useradd \
        --uid "${UID}" \
        --gid "${GID}" \
        --home-dir "/home/${USERNAME}" \
        --create-home \
        --shell /bin/bash \
        "${USERNAME}"; \
    fi; \
    mkdir -p "/home/${USERNAME}"; \
    chown -R "${UID}:${GID}" "/home/${USERNAME}"

RUN echo "export PS1='\u@ubuntu:\w\$ '" >> /home/${USERNAME}/.bashrc \
    && echo "cd /home/${USERNAME}" >> /home/${USERNAME}/.bashrc \
    && chown ${UID}:${GID} /home/${USERNAME}/.bashrc

USER ${USERNAME}
WORKDIR /home/${USERNAME}

CMD ["/bin/bash", "-l"]
```

Build it:

```bash
docker build --no-cache \
  -f Dockerfile.terminal \
  -t admin-panel-terminal:chidchanun \
  --build-arg USERNAME=ChidchanunServer \
  --build-arg UID=$(id -u ChidchanunServer) \
  --build-arg GID=$(id -g ChidchanunServer) \
  .
```

## Settings

Runtime settings are saved under `logs/` by default:

- `logs/admin-settings.json`
- `logs/security-blocks.json`
- `logs/admin-audit.log`

You can override these paths:

```bash
ADMIN_SETTINGS_PATH=/var/lib/ubuntu-admin/admin-settings.json
SECURITY_BLOCK_STORE_PATH=/var/lib/ubuntu-admin/security-blocks.json
AUDIT_LOG_PATH=/var/log/ubuntu-admin/audit.log
```

The Settings page can export/import a JSON backup of service allowlists and security settings. It also includes `System Backup` for admin settings, health targets, security blocks, and optional health history. Audit logs can be exported for review but are not overwritten during restore.

The web editor creates a backup before every successful save. By default backups are stored beside the file under `.admin-backups/`. Override this with:

```bash
FILE_BACKUP_DIR=/var/backups/ubuntu-admin
```

The Editor page can list and restore these backup versions for the currently opened file.

## Health Checks

Health checks are configured from environment variables:

```bash
HEALTH_CHECK_URLS=App|http://127.0.0.1:3000,API|http://127.0.0.1:8080/health
HEALTH_CHECK_PORTS=SSH|127.0.0.1:22,MySQL|127.0.0.1:3306
HEALTH_HTTP_TIMEOUT_MS=5000
HEALTH_TCP_TIMEOUT_MS=3000
```

Each entry can be `Label|target` or just the target. Results appear in `/health` and unhealthy targets are included in `/notifications`.

For PM2 apps, choose `PM2 logs` while adding a website and enter the process name:

```text
Label: ERP Web
URL: http://localhost:3001
PM2 process name: erp-web
```

The Health page shows a `View Logs` button that reads recent output with `pm2 logs <name> --lines 200 --nostream`. Set `PM2_PATH` or `PM2_LOG_LINES` if your server needs different values.

## Package Installer

Package installation is available from `/packages`. By default it requires a package allowlist:

```bash
PACKAGE_INSTALL_USERS=yourUbuntuUser
PACKAGE_INSTALL_ALLOWLIST=htop,curl,git
```

Use `PACKAGE_INSTALL_ALLOW_ANY=true` only if you intentionally allow admins to install any valid apt package name.

The Updates page can run a one-click update and upgrade:

```bash
sudo -n apt-get update
sudo -n apt-get upgrade -y
```

## Development

Because the interactive terminal requires WebSocket upgrade handling, use the custom server:

```json
"scripts": {
  "dev": "NODE_ENV=development node server.cjs",
  "build": "next build",
  "start": "NODE_ENV=production node server.cjs",
  "lint": "eslint"
}
```

Run:

```bash
npm run dev
npm run lint
npm run build
```

If you open the dev server through an IP/domain, add it to `next.config.mjs`:

```js
const nextConfig = {
  allowedDevOrigins: ["192.168.1.50", "chidchanun.online"],
  serverExternalPackages: ["authenticate-pam"],
};

export default nextConfig;
```

## Production

```bash
npm run build
npm run start
```

Run behind HTTPS and a reverse proxy. Forward `Host`, `X-Forwarded-Proto`, `Upgrade`, and `Connection` so redirects, secure cookies, and WebSocket terminal sessions work correctly.

For a full Ubuntu deployment walkthrough with PAM, systemd, nginx, HTTPS, PM2, sudoers, Docker sandbox terminal, and backup notes, see [DEPLOYMENT.md](./DEPLOYMENT.md).
For production hardening notes covering webhook tests, 2FA, audit retention, terminal sandboxing, and recommendations, see [HARDENING.md](./HARDENING.md).

## Security Notes

- Keep `AUTH_SECRET` private and long.
- Keep `LOGIN_ALLOWED_USERS`, `ADMIN_USERS`, `FILE_WRITE_USERS`, `SERVICE_RESTART_USERS`, `SERVICE_CONTROL_USERS`, `FIREWALL_USERS`, and terminal access narrow.
- Use HTTPS and firewall restrictions.
- Keep the Web Terminal behind 2FA and strict admin access.
- Prefer Docker sandbox terminal over host root shell access.
- Do not mount `/`, `/etc`, `/var`, or `/root` into the terminal container unless you intentionally accept the risk.
- Use the whitelist before enabling aggressive auto-block rules.
- Review audit logs after service, file, firewall, settings, package, and terminal actions.
- Do not expose this panel publicly without HTTPS, 2FA, and network restrictions.
