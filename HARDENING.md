# Ubuntu Admin Panel Hardening Notes

This document lists production hardening recommendations for Ubuntu Admin Panel. The panel can control sensitive parts of a server, so production deployments should use HTTPS, strict user allowlists, TOTP 2FA, narrow sudoers rules, audit logs, and a sandboxed Web Terminal.

## Webhook Test

After adding alert webhook URLs in Settings, use `Test Webhook` to confirm the endpoint accepts JSON payloads.

The payload includes:

- `content`
- `text`
- `title`
- `notification`

Discord-compatible webhooks can usually accept this directly. LINE or Telegram usually need a small relay endpoint.

For Discord bot delivery, add the bot token and either a channel ID or DM user IDs in Settings. DM delivery requires the bot and user to share a server, and the user must allow DMs from that server.

## Two-Factor Authentication

Enable TOTP 2FA from Settings for each admin user.

1. Generate a 2FA secret.
2. Add the manual secret or otpauth URI to an authenticator app.
3. Enter the 6-digit code to verify and enable.

After 2FA is enabled, login requires both the Ubuntu password and the 6-digit authenticator code.

Supported authenticator apps include Microsoft Authenticator, Google Authenticator, 1Password, Bitwarden Authenticator, and any app that supports TOTP.

Recommended production policy:

```bash
LOGIN_ALLOWED_USERS=ChidchanunServer
ADMIN_USERS=ChidchanunServer
AUTH_COOKIE_SECURE=true
```

## PAM sudo TOTP For Host Root Actions

Application login 2FA protects the web app. Host-level `sudo` should be protected separately through PAM when admins SSH into the server directly.

Install TOTP PAM support:

```bash
sudo apt update
sudo apt install -y libpam-google-authenticator
```

Run this as the user that will use `sudo`:

```bash
google-authenticator
chmod 600 ~/.google_authenticator
```

Edit `/etc/pam.d/sudo` and add the Google Authenticator PAM module after `@include common-auth`:

```pam
@include common-auth
auth required pam_google_authenticator.so
```

Set the sudo verification cache duration with `visudo`:

```bash
sudo visudo -f /etc/sudoers.d/00-terminal-auth
```

Recommended balanced setting:

```sudoers
Defaults timestamp_timeout=15
Defaults passwd_tries=3
```

Use `timestamp_timeout=0` only if you want sudo to ask every time. Avoid `timestamp_timeout=-1` on shared or browser-accessible systems because it keeps sudo authenticated for too long.

Test safely from an existing SSH session:

```bash
sudo -k
sudo whoami
```

Expected result: password prompt, verification code prompt, then `root`.

## Audit Retention

Audit retention can be changed in Settings.

Defaults for fresh installs can be set with:

```bash
AUDIT_RETENTION_DAYS=30
AUDIT_RETENTION_MAX_ENTRIES=10000
```

The app prunes audit logs after audit events are written.

## Security Recommendations

The Diagnostics page should warn about risky configuration, including:

- missing `LOGIN_ALLOWED_USERS`
- missing `ADMIN_USERS`
- insecure cookie or non-HTTPS production access
- sudoers not configured for non-interactive service/UFW actions
- localhost not whitelisted while private IP auto-block is enabled
- alert webhooks not enabled
- 2FA not enabled
- Web Terminal enabled without Docker sandbox or strong network restrictions
- terminal container network enabled when not required
- terminal mount points broader than necessary

## Web Terminal

The recommended `/terminal` design is an interactive terminal with isolation:

```text
Browser xterm.js
  -> WebSocket /api/terminal/pty
  -> node-pty
  -> Docker sandbox container
  -> /bin/bash as ChidchanunServer
  -> bind mount /home/ChidchanunServer only
```

This allows `nano`, `vim`, `top`, and other TTY programs while avoiding direct host root shell access from the browser.

Recommended production terminal settings:

```bash
TERMINAL_CONTAINER_IMAGE=admin-panel-terminal:chidchanun
TERMINAL_CONTAINER_USERNAME=ChidchanunServer
TERMINAL_CONTAINER_HOME=/home/ChidchanunServer
TERMINAL_CONTAINER_MOUNT=/home/ChidchanunServer
TERMINAL_CONTAINER_NETWORK=none
```

Only use network access when needed:

```bash
TERMINAL_CONTAINER_NETWORK=bridge
```

Recommended Docker runtime restrictions:

```text
--read-only
--tmpfs /tmp:rw,nosuid,nodev,size=128m
--tmpfs /run:rw,nosuid,nodev,size=64m
--cap-drop ALL
--security-opt no-new-privileges
--pids-limit 256
--memory 512m
--cpus 1
--network none
```

Do not mount these paths into the terminal container unless you intentionally accept the risk:

```text
/
/etc
/var
/root
/run/docker.sock
```

Mounting `/var/run/docker.sock` gives container users control over Docker and is effectively root-equivalent on the host.

## Docker Group Warning

If the Node process user can run Docker, that user has very high privilege on the host. Treat Docker access as sensitive.

Safer options:

- Run the panel only for trusted admins.
- Keep the panel behind HTTPS and 2FA.
- Restrict access by firewall or Cloudflare Access.
- Mount only `/home/ChidchanunServer` into the terminal container.
- Keep terminal container network disabled by default.
- Review `/audit` after terminal use.

## Legacy Terminal Modes

### Controlled allowlist mode

Use this if you do not need `nano` or other interactive programs:

```bash
TERMINAL_ALLOW_SHELL=false
TERMINAL_ALLOWED_COMMANDS=uptime,df,free,who,pm2,systemctl,journalctl,ls,pwd
```

### Host shell mode

Host shell mode is powerful and should not be exposed publicly:

```bash
TERMINAL_ALLOW_SHELL=true
TERMINAL_SHELL=/bin/bash
TERMINAL_TIMEOUT_MS=30000
TERMINAL_MAX_BUFFER=1048576
```

Avoid host shell mode when possible. Prefer Docker sandbox terminal for browser-based terminal access.

## Network Restrictions

Recommended layers:

1. HTTPS only.
2. `AUTH_COOKIE_SECURE=true`.
3. Strong `AUTH_SECRET`.
4. Narrow `LOGIN_ALLOWED_USERS` and `ADMIN_USERS`.
5. TOTP 2FA enabled for all admins.
6. Firewall or Cloudflare Access limiting who can reach the panel.
7. Terminal container network disabled unless needed.

## Backup And Recovery

Before changing sudoers, PAM, Docker terminal settings, firewall, or service allowlists:

```bash
sudo cp /etc/pam.d/sudo /etc/pam.d/sudo.bak
sudo cp /etc/sudoers /etc/sudoers.bak
```

Use the Settings page to export `Backup Settings` and `System Backup` before major changes.

## Production Checklist

- `AUTH_SECRET` is long and private.
- `AUTH_COOKIE_SECURE=true` in HTTPS production.
- `LOGIN_ALLOWED_USERS` and `ADMIN_USERS` are narrow.
- All admin users have TOTP 2FA enabled.
- Web Terminal uses Docker sandbox, not direct host shell.
- Terminal mount is limited to `/home/ChidchanunServer` or another narrow workspace.
- Terminal container network is `none` unless needed.
- Sudoers rules are `NOPASSWD` only for required non-interactive commands.
- Host `sudo` is protected by PAM TOTP if admins use SSH/root workflows.
- Audit retention is configured.
- Alert webhooks are tested.
- Backups are exported and stored off-server.
