# Ubuntu Admin Panel Hardening Notes

## Webhook Test

After adding alert webhook URLs in Settings, use `Test Webhook` to confirm the endpoint accepts JSON payloads.

The payload includes:

- `content`
- `text`
- `title`
- `notification`

Discord-compatible webhooks can usually accept this directly. LINE or Telegram usually need a small relay endpoint.

For Discord bot delivery, add the bot token and either a channel ID or DM user IDs in Settings.
DM delivery requires the bot and user to share a server, and the user must allow DMs from that server.

## Two-Factor Authentication

Enable TOTP 2FA from Settings for each admin user.

1. Generate a 2FA secret.
2. Add the manual secret or otpauth URI to an authenticator app.
3. Enter the 6-digit code to verify and enable.

After 2FA is enabled, login requires both the Ubuntu password and the 6-digit authenticator code.

## Audit Retention

Audit retention can be changed in Settings.

Defaults for fresh installs can be set with:

```bash
AUDIT_RETENTION_DAYS=30
AUDIT_RETENTION_MAX_ENTRIES=10000
```

The app prunes audit logs after audit events are written.

## Security Recommendations

The Diagnostics page now shows hardening recommendations, including:

- missing `LOGIN_ALLOWED_USERS`
- missing `ADMIN_USERS`
- insecure cookie or non-HTTPS production access
- sudoers not configured for non-interactive service/UFW actions
- localhost not whitelisted while private IP auto-block is enabled
- alert webhooks not enabled
- 2FA not enabled

## Package Installer

The `/packages` page installs apt packages through a controlled API, not a full shell.

Recommended production defaults:

```bash
PACKAGE_INSTALL_USERS=yourUbuntuUser
PACKAGE_INSTALL_ALLOWLIST=htop,curl,git
```

The install action runs:

```bash
sudo -n apt-get install -y --no-install-recommends <package>
```

Add narrow sudoers rules for the Node process user. Use `PACKAGE_INSTALL_ALLOW_ANY=true` only when you accept that admins can install any valid apt package name.

## Update + Upgrade

The Updates page can run `apt-get update` followed by `apt-get upgrade -y`.

The Node process user needs non-interactive sudo for:

```bash
sudo -n apt-get update
sudo -n apt-get upgrade -y
```

## Web Terminal

The `/terminal` page runs a full shell by default for admin users and records commands in audit logs.
It keeps a per-user working directory in server memory and supports `cd`, `pwd`, and `clear`.
This is powerful and should be exposed only behind HTTPS, strict admin users, and 2FA.

To disable shell mode and return to controlled command allowlists:

```bash
TERMINAL_ALLOW_SHELL=false
TERMINAL_ALLOWED_COMMANDS=uptime,df,free,who,pm2,systemctl,journalctl,ls,pwd
```

Shell mode options:

```bash
TERMINAL_ALLOW_SHELL=true
TERMINAL_SHELL=/bin/bash
TERMINAL_TIMEOUT_MS=30000
TERMINAL_MAX_BUFFER=1048576
```

Do not expose shell mode publicly without strong network restrictions.
