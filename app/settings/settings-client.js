"use client";

import { useCallback, useEffect, useState } from "react";
import AppSidebar, { AppMobileNav } from "@/app/components/app-sidebar";

function listToText(value) {
  return (value || []).join("\n");
}

function textToList(value) {
  return String(value || "")
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function ToggleButton({ checked, label, onToggle }) {
  return (
    <button
      aria-pressed={checked}
      className={`flex h-11 items-center gap-3 rounded-md border px-4 text-sm font-bold transition ${
        checked
          ? "border-emerald-400/30 bg-emerald-400/12 text-emerald-100"
          : "border-white/10 bg-white/8 text-white/58 hover:bg-white/12"
      }`}
      onClick={onToggle}
      type="button"
    >
      <span className={`relative h-5 w-9 rounded-full ${checked ? "bg-current/50" : "bg-white/20"}`}>
        <span
          className={`absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white transition ${
            checked ? "left-4" : "left-0.5"
          }`}
        />
      </span>
      {label} {checked ? "On" : "Off"}
    </button>
  );
}

function ListField({ label, value, onChange }) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-bold text-white/72">{label}</span>
      <textarea
        className="min-h-32 rounded-md border border-white/10 bg-black/24 px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-white/35 focus:border-[#e95420]"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}

function ServiceSelectField({ availableServices, label, onChange, value }) {
  const selected = new Set(value || []);
  const options = [...new Set([...availableServices, ...value])]
    .sort()
    .filter((service) => !selected.has(service));

  function addService(service) {
    if (service) {
      onChange([...value, service].sort());
    }
  }

  function removeService(service) {
    onChange(value.filter((item) => item !== service));
  }

  return (
    <div className="grid min-w-0 gap-3">
      <label className="grid gap-2">
        <span className="text-sm font-bold text-white/72">{label}</span>
        <select
          className="h-11 min-w-0 w-full rounded-md border border-white/10 bg-black/24 px-4 text-sm text-white outline-none transition focus:border-[#e95420]"
          onChange={(event) => {
            addService(event.target.value);
            event.target.value = "";
          }}
          value=""
        >
          <option value="">Select service...</option>
          {options.map((service) => (
            <option className="bg-[#111111]" key={service} value={service}>
              {service}
            </option>
          ))}
        </select>
      </label>

      <div className="flex min-h-24 min-w-0 flex-wrap content-start gap-2 rounded-md border border-white/10 bg-black/18 p-3">
        {value.length > 0 ? (
          value.map((service) => (
            <span
              className="inline-flex max-w-full min-w-0 items-center gap-2 rounded-md border border-white/10 bg-white/8 px-3 py-2 text-sm font-semibold text-white/72"
              key={service}
            >
              <span className="min-w-0 truncate">{service}</span>
              <button
                className="shrink-0 rounded bg-white/10 px-2 py-0.5 text-xs text-white transition hover:bg-white/20"
                onClick={() => removeService(service)}
                type="button"
              >
                Remove
              </button>
            </span>
          ))
        ) : (
          <span className="text-sm text-white/42">No services selected.</span>
        )}
      </div>
    </div>
  );
}

function RoleList({ label, value }) {
  return (
    <div className="rounded-md border border-white/10 bg-black/18 p-4">
      <p className="text-sm font-bold text-white/72">{label}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {(value || []).length > 0 ? (
          value.map((item) => (
            <span
              className="rounded-md border border-white/10 bg-white/8 px-3 py-1.5 text-sm font-semibold text-white/72"
              key={item}
            >
              {item}
            </span>
          ))
        ) : (
          <span className="text-sm text-white/42">Uses default policy.</span>
        )}
      </div>
    </div>
  );
}

export default function SettingsClient({ username }) {
  const [availableServices, setAvailableServices] = useState([]);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [security, setSecurity] = useState(null);
  const [service, setService] = useState(null);
  const [roles, setRoles] = useState(null);
  const [isSystemBackupBusy, setIsSystemBackupBusy] = useState(false);
  const [systemBackup, setSystemBackup] = useState({
    includeAudit: false,
    includeHistory: true,
    restoreHistory: false,
  });

  const loadSettings = useCallback(async () => {
    setIsLoading(true);

    try {
      const response = await fetch("/api/settings", { cache: "no-store" });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || `Settings API returned ${response.status}`);
      }

      setService({
        controllableServices: payload.service.controllableServices || [],
        monitoredServices: payload.service.monitoredServices || [],
        restartableServices: payload.service.restartableServices || [],
      });
      setAvailableServices(payload.availableServices || []);
      setSecurity({
        autoAppBlock: Boolean(payload.security.autoAppBlock),
        autoBlockPrivateIps: Boolean(payload.security.autoBlockPrivateIps),
        autoFirewallBlock: Boolean(payload.security.autoFirewallBlock),
        whitelistIps: listToText(payload.security.whitelistIps),
      });
      setRoles(payload.roles || {});
      setError(null);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = setTimeout(loadSettings, 0);

    return () => clearTimeout(timeout);
  }, [loadSettings]);

  async function saveSettings(event) {
    event.preventDefault();

    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          security: {
            ...security,
            whitelistIps: textToList(security.whitelistIps),
          },
          service: {
            controllableServices: service.controllableServices,
            monitoredServices: service.monitoredServices,
            restartableServices: service.restartableServices,
          },
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || `Settings API returned ${response.status}`);
      }

      setMessage("Settings saved.");
      setError(null);
      await loadSettings();
    } catch (saveError) {
      setError(saveError.message);
      setMessage(null);
    }
  }

  function exportSettings() {
    const payload = {
      exportedAt: new Date().toISOString(),
      security: {
        ...security,
        whitelistIps: textToList(security.whitelistIps),
      },
      service,
      version: 1,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "ubuntu-admin-settings.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importSettings(event) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const payload = JSON.parse(await file.text());

      if (!payload.service || !payload.security) {
        throw new Error("Settings backup must include service and security sections.");
      }

      setService({
        controllableServices: payload.service.controllableServices || [],
        monitoredServices: payload.service.monitoredServices || [],
        restartableServices: payload.service.restartableServices || [],
      });
      setSecurity({
        autoAppBlock: Boolean(payload.security.autoAppBlock),
        autoBlockPrivateIps: Boolean(payload.security.autoBlockPrivateIps),
        autoFirewallBlock: Boolean(payload.security.autoFirewallBlock),
        whitelistIps: listToText(payload.security.whitelistIps),
      });
      setMessage("Backup imported. Review then save settings to apply.");
      setError(null);
    } catch (importError) {
      setError(importError.message);
      setMessage(null);
    } finally {
      event.target.value = "";
    }
  }

  async function exportSystemBackup() {
    setIsSystemBackupBusy(true);

    try {
      const params = new URLSearchParams({
        includeAudit: systemBackup.includeAudit ? "1" : "0",
        includeHistory: systemBackup.includeHistory ? "1" : "0",
      });
      const response = await fetch(`/api/system-backup?${params.toString()}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));

        throw new Error(payload.error || `System backup API returned ${response.status}`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = "ubuntu-admin-system-backup.json";
      link.click();
      URL.revokeObjectURL(url);
      setMessage("System backup exported.");
      setError(null);
    } catch (backupError) {
      setError(backupError.message);
      setMessage(null);
    } finally {
      setIsSystemBackupBusy(false);
    }
  }

  async function importSystemBackup(event) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setIsSystemBackupBusy(true);

    try {
      const backup = JSON.parse(await file.text());
      const response = await fetch("/api/system-backup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          backup,
          restoreHistory: systemBackup.restoreHistory,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || `System backup API returned ${response.status}`);
      }

      setMessage(`System backup restored: ${payload.restored.join(", ")}.`);
      setError(null);
      await loadSettings();
    } catch (restoreError) {
      setError(restoreError.message);
      setMessage(null);
    } finally {
      event.target.value = "";
      setIsSystemBackupBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#1c1b22] text-white">
      <AppMobileNav activeItem="Settings" />
      <div className="grid min-h-screen lg:grid-cols-[280px_minmax(0,1fr)]">
        <AppSidebar
          activeItem="Settings"
          helperText="Settings saved here override environment defaults."
          username={username}
        />

        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_0%,rgba(233,84,32,0.20),transparent_30%),linear-gradient(135deg,rgba(44,0,30,0.58),rgba(17,17,17,0.98)_56%)]" />

          <div className="relative z-10 px-5 py-5 sm:px-8 lg:px-10">
            <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#ffb088]">
                  Settings
                </p>
                <h1 className="mt-2 text-3xl font-bold tracking-normal">Admin Settings</h1>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  className="h-10 rounded-md border border-white/14 px-4 text-sm font-semibold text-white transition hover:bg-white/10"
                  onClick={loadSettings}
                  type="button"
                >
                  Refresh
                </button>
                <form action="/api/logout" method="post">
                  <button
                    className="h-10 rounded-md border border-white/14 px-4 text-sm font-semibold text-white transition hover:bg-white/10"
                    type="submit"
                  >
                    Logout
                  </button>
                </form>
              </div>
            </header>

            <form className="grid gap-5 py-7" onSubmit={saveSettings}>
              {error ? (
                <section className="rounded-lg border border-[#e95420]/50 bg-[#e95420]/14 p-5">
                  <h2 className="text-xl font-bold tracking-normal">Settings error</h2>
                  <p className="mt-2 text-sm leading-6 text-white/70">{error}</p>
                </section>
              ) : null}

              {message ? (
                <section className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-4">
                  <p className="text-sm font-semibold text-emerald-100">{message}</p>
                </section>
              ) : null}

              {isLoading || !service || !security ? (
                <p className="rounded-md bg-black/20 px-4 py-5 text-sm text-white/58">
                  Loading settings...
                </p>
              ) : (
                <>
                  <section className="min-w-0 rounded-lg border border-white/10 bg-[#111111]/70 p-5">
                    <h2 className="text-xl font-bold tracking-normal">Service Allowlists</h2>
                    <div className="mt-5 grid min-w-0 gap-5 2xl:grid-cols-3">
                      <ServiceSelectField
                        availableServices={availableServices}
                        label="Monitored Services"
                        onChange={(value) => setService({ ...service, monitoredServices: value })}
                        value={service.monitoredServices}
                      />
                      <ServiceSelectField
                        availableServices={availableServices}
                        label="Restartable Services"
                        onChange={(value) => setService({ ...service, restartableServices: value })}
                        value={service.restartableServices}
                      />
                      <ServiceSelectField
                        availableServices={availableServices}
                        label="Controllable Services"
                        onChange={(value) =>
                          setService({ ...service, controllableServices: value })
                        }
                        value={service.controllableServices}
                      />
                    </div>
                  </section>

                  <section className="rounded-lg border border-white/10 bg-[#111111]/70 p-5">
                    <h2 className="text-xl font-bold tracking-normal">Security Settings</h2>
                    <div className="mt-5 flex flex-wrap gap-3">
                      <ToggleButton
                        checked={security.autoAppBlock}
                        label="App Auto Block"
                        onToggle={() =>
                          setSecurity({ ...security, autoAppBlock: !security.autoAppBlock })
                        }
                      />
                      <ToggleButton
                        checked={security.autoFirewallBlock}
                        label="UFW Auto Block"
                        onToggle={() =>
                          setSecurity({
                            ...security,
                            autoFirewallBlock: !security.autoFirewallBlock,
                          })
                        }
                      />
                      <ToggleButton
                        checked={security.autoBlockPrivateIps}
                        label="Private IP Auto Block"
                        onToggle={() =>
                          setSecurity({
                            ...security,
                            autoBlockPrivateIps: !security.autoBlockPrivateIps,
                          })
                        }
                      />
                    </div>

                    <div className="mt-5">
                      <ListField
                        label="Security Whitelist IPs"
                        onChange={(value) => setSecurity({ ...security, whitelistIps: value })}
                        value={security.whitelistIps}
                      />
                    </div>
                  </section>

                  <section className="rounded-lg border border-white/10 bg-[#111111]/70 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <h2 className="text-xl font-bold tracking-normal">Role Permissions</h2>
                        <p className="mt-2 text-sm leading-6 text-white/56">
                          These values come from environment variables and are read-only here.
                        </p>
                      </div>
                    </div>
                    <div className="mt-5 grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                      <RoleList label="Login Allowed Users" value={roles?.loginAllowedUsers} />
                      <RoleList label="Admin Users" value={roles?.adminUsers} />
                      <RoleList label="File Write Users" value={roles?.fileWriteUsers} />
                      <RoleList label="Service Restart Users" value={roles?.serviceRestartUsers} />
                      <RoleList label="Service Control Users" value={roles?.serviceControlUsers} />
                      <RoleList label="Firewall Users" value={roles?.firewallUsers} />
                    </div>
                  </section>

                  <section className="rounded-lg border border-white/10 bg-[#111111]/70 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <h2 className="text-xl font-bold tracking-normal">Backup Settings</h2>
                        <p className="mt-2 text-sm leading-6 text-white/56">
                          Export or restore service allowlists and security guard settings.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          className="h-10 rounded-md border border-white/14 px-4 text-sm font-semibold text-white transition hover:bg-white/10"
                          onClick={exportSettings}
                          type="button"
                        >
                          Export JSON
                        </button>
                        <label className="grid h-10 cursor-pointer place-items-center rounded-md border border-white/14 px-4 text-sm font-semibold text-white transition hover:bg-white/10">
                          Import JSON
                          <input
                            accept="application/json,.json"
                            className="sr-only"
                            onChange={importSettings}
                            type="file"
                          />
                        </label>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-lg border border-white/10 bg-[#111111]/70 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <h2 className="text-xl font-bold tracking-normal">System Backup</h2>
                        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/56">
                          Export service settings, health targets, security blocks, and optional
                          history into one file. Audit logs can be exported for review but are not
                          overwritten during restore.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          className="h-10 rounded-md border border-white/14 px-4 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={isSystemBackupBusy}
                          onClick={exportSystemBackup}
                          type="button"
                        >
                          Export System
                        </button>
                        <label
                          className={`grid h-10 place-items-center rounded-md border border-white/14 px-4 text-sm font-semibold text-white transition ${
                            isSystemBackupBusy
                              ? "cursor-not-allowed opacity-50"
                              : "cursor-pointer hover:bg-white/10"
                          }`}
                        >
                          Restore System
                          <input
                            accept="application/json,.json"
                            className="sr-only"
                            disabled={isSystemBackupBusy}
                            onChange={importSystemBackup}
                            type="file"
                          />
                        </label>
                      </div>
                    </div>

                    <div className="mt-5 flex flex-wrap gap-3">
                      <ToggleButton
                        checked={systemBackup.includeHistory}
                        label="Export Health History"
                        onToggle={() =>
                          setSystemBackup({
                            ...systemBackup,
                            includeHistory: !systemBackup.includeHistory,
                          })
                        }
                      />
                      <ToggleButton
                        checked={systemBackup.includeAudit}
                        label="Export Audit Log"
                        onToggle={() =>
                          setSystemBackup({
                            ...systemBackup,
                            includeAudit: !systemBackup.includeAudit,
                          })
                        }
                      />
                      <ToggleButton
                        checked={systemBackup.restoreHistory}
                        label="Restore Health History"
                        onToggle={() =>
                          setSystemBackup({
                            ...systemBackup,
                            restoreHistory: !systemBackup.restoreHistory,
                          })
                        }
                      />
                    </div>
                  </section>

                  <div className="flex justify-end">
                    <button
                      className="h-11 rounded-md bg-[#e95420] px-6 text-sm font-bold text-white transition hover:bg-[#c34113]"
                      type="submit"
                    >
                      Save Settings
                    </button>
                  </div>
                </>
              )}
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
