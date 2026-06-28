# Ubuntu Admin Panel

Next.js admin panel for managing an Ubuntu server from a browser. It uses the same Linux user/password through PAM, then shows server status, services, security events, files, editor, audit logs, settings, and system users.

## Features

- PAM login with Ubuntu server users
- Dashboard with CPU, RAM, disk, temperature, notices, and service health
- Connections page for active IPs and connection activity
- File browser with file/folder icons, create file, create folder, and web editor
- Services page with filtering, detail logs, and start/stop/restart/enable/disable actions
- Security guard for suspicious path scans, high-rate requests, manual blocks, whitelist, and optional UFW block
- Audit log for admin actions
- Settings page for service allowlists, security toggles, whitelist, and JSON backup/restore
- Users page for `/etc/passwd`, active shell sessions, and recent failed SSH logins

## Requirements

- Ubuntu server for production use
- Node.js supported by Next.js 16
- `systemctl`, `ss`, `journalctl`, and `who` for full server monitoring
- `authenticate-pam` installed on the Ubuntu server for PAM login
- Optional: `ufw` and sudo permissions for firewall blocking

## Setup

```bash
npm install
npm install authenticate-pam
cp .env.example .env.local
npm run dev
```

If you do not have `.env.example`, create `.env.local` with the values you need:

```bash
AUTH_SECRET=change-this-long-random-secret
LOGIN_ALLOWED_USERS=yourUbuntuUser
ADMIN_USERS=yourUbuntuUser
PAM_SERVICE=nextjs
FILE_BROWSER_ROOT=/home
AUTH_COOKIE_SECURE=false
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

## Permissions

Some actions require the Node process user to have Linux permissions:

- Reading files depends on normal filesystem permissions.
- Writing files requires the app user to own the target files or have write access.
- Restarting services or UFW blocking usually needs sudo/polkit configuration.

Example sudoers entries, adjust usernames and service names before using:

```text
ubuntu-admin ALL=(root) NOPASSWD: /bin/systemctl restart nginx.service, /bin/systemctl start nginx.service, /bin/systemctl stop nginx.service
ubuntu-admin ALL=(root) NOPASSWD: /usr/sbin/ufw deny from *
ubuntu-admin ALL=(root) NOPASSWD: /usr/sbin/ufw delete deny from *
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

The Settings page can export/import a JSON backup of service allowlists and security settings.

## Development

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

Run behind HTTPS and a reverse proxy. Forward `Host` and `X-Forwarded-Proto` so redirects and secure cookies use the public URL.

## Security Notes

- Keep `AUTH_SECRET` private and long.
- Keep `LOGIN_ALLOWED_USERS`, `ADMIN_USERS`, `FILE_WRITE_USERS`, `SERVICE_RESTART_USERS`, `SERVICE_CONTROL_USERS`, and `FIREWALL_USERS` narrow.
- Use the whitelist before enabling aggressive auto-block rules.
- Review audit logs after service, file, firewall, and settings changes.
- Do not expose this panel publicly without HTTPS and firewall restrictions.
