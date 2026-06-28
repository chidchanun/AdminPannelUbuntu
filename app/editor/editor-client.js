"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import AppSidebar, { AppMobileNav } from "@/app/components/app-sidebar";

function formatBytes(value) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function getDirectoryPath(filePath) {
  const separator = filePath.includes("\\") ? "\\" : "/";
  const index = filePath.lastIndexOf(separator);

  if (index <= 0) {
    return separator;
  }

  return filePath.slice(0, index);
}

export default function EditorClient({ initialPath, username }) {
  const [pathInput, setPathInput] = useState(initialPath);
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [fileInfo, setFileInfo] = useState(null);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [backups, setBackups] = useState([]);
  const [isBackupBusy, setIsBackupBusy] = useState(false);

  const isDirty = content !== savedContent;
  const lineCount = useMemo(() => (content ? content.split("\n").length : 1), [content]);

  const loadBackups = useCallback(async (targetPath) => {
    if (!targetPath) {
      setBackups([]);
      return;
    }

    setIsBackupBusy(true);

    try {
      const response = await fetch(
        `/api/file-backups?path=${encodeURIComponent(targetPath)}`,
        { cache: "no-store" },
      );
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || `Backups API returned ${response.status}`);
      }

      setBackups(payload.backups || []);
    } catch (backupError) {
      setError(backupError.message);
    } finally {
      setIsBackupBusy(false);
    }
  }, []);

  const loadFile = useCallback(async (nextPath) => {
    const targetPath = String(nextPath || "").trim();

    if (!targetPath) {
      setError("Please enter a file path.");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(
        `/api/file-content?path=${encodeURIComponent(targetPath)}`,
        { cache: "no-store" },
      );
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || `Editor API returned ${response.status}`);
      }

      setContent(payload.content);
      setSavedContent(payload.content);
      setCurrentPath(payload.path);
      setPathInput(payload.path);
      setFileInfo(payload);
      setMessage("File loaded.");
      setError(null);
      await loadBackups(payload.path);
    } catch (loadError) {
      setError(loadError.message);
      setMessage(null);
    } finally {
      setIsLoading(false);
    }
  }, [loadBackups]);

  useEffect(() => {
    async function loadInitialFile() {
      if (initialPath) {
        await loadFile(initialPath);
      }
    }

    loadInitialFile();
  }, [initialPath, loadFile]);

  async function saveFile() {
    if (!currentPath) {
      setError("Load a file before saving.");
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch("/api/file-content", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          path: currentPath,
          content,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || `Editor API returned ${response.status}`);
      }

      setSavedContent(content);
      setFileInfo((current) => ({
        ...current,
        backupPath: payload.backupPath,
        size: payload.size,
        modifiedAt: payload.savedAt,
      }));
      setMessage(`Saved successfully. Backup: ${payload.backupPath}`);
      setError(null);
      await loadBackups(currentPath);
    } catch (saveError) {
      setError(saveError.message);
      setMessage(null);
    } finally {
      setIsSaving(false);
    }
  }

  async function restoreBackup(backupPath) {
    if (!currentPath || !backupPath) {
      return;
    }

    setIsBackupBusy(true);

    try {
      const response = await fetch("/api/file-backups", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          backupPath,
          path: currentPath,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || `Backups API returned ${response.status}`);
      }

      setMessage(`Restored from backup: ${payload.restoredFrom}`);
      setError(null);
      await loadFile(currentPath);
    } catch (restoreError) {
      setError(restoreError.message);
      setMessage(null);
    } finally {
      setIsBackupBusy(false);
    }
  }

  function submitPath(event) {
    event.preventDefault();
    loadFile(pathInput);
  }

  return (
    <main className="min-h-screen bg-[#1c1b22] text-white">
      <AppMobileNav activeItem="Editor" />
      <div className="grid min-h-screen lg:grid-cols-[280px_minmax(0,1fr)]">
        <AppSidebar
          activeItem="Editor"
          helperText="Text editor access follows server process permissions."
          username={username}
        />

        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_0%,rgba(233,84,32,0.20),transparent_30%),linear-gradient(135deg,rgba(44,0,30,0.58),rgba(17,17,17,0.98)_56%)]" />

          <div className="relative z-10 px-5 py-5 sm:px-8 lg:px-10">
            <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#ffb088]">
                  Web Editor
                </p>
                <h1 className="mt-2 text-3xl font-bold tracking-normal">
                  Server Text Editor
                </h1>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {currentPath ? (
                  <Link
                    className="h-10 rounded-md border border-white/14 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
                    href={`/files?path=${encodeURIComponent(getDirectoryPath(currentPath))}`}
                  >
                    Directory
                  </Link>
                ) : null}
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

            <div className="grid gap-5 py-7">
              <section className="rounded-lg border border-white/10 bg-white/[0.05] p-5">
                <form className="grid gap-3 lg:grid-cols-[1fr_auto_auto]" onSubmit={submitPath}>
                  <input
                    className="h-11 rounded-md border border-white/10 bg-black/24 px-4 font-mono text-sm text-white outline-none transition placeholder:text-white/35 focus:border-[#e95420]"
                    onChange={(event) => setPathInput(event.target.value)}
                    placeholder="Enter file path to edit"
                    value={pathInput}
                  />
                  <button
                    className="h-11 rounded-md border border-white/14 px-5 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={isLoading}
                    type="submit"
                  >
                    {isLoading ? "Loading" : "Open"}
                  </button>
                  <button
                    className="h-11 rounded-md bg-[#e95420] px-5 text-sm font-bold text-white transition hover:bg-[#c34113] disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={isSaving || !currentPath || !isDirty}
                    onClick={saveFile}
                    type="button"
                  >
                    {isSaving ? "Saving" : "Save"}
                  </button>
                </form>

                <div className="mt-4 grid gap-2 text-sm text-white/58">
                  <p>
                    Current:{" "}
                    <span className="break-all font-mono text-white/78">
                      {currentPath || "-"}
                    </span>
                  </p>
                  <p>
                    Status:{" "}
                    <span className={isDirty ? "text-[#ffb088]" : "text-emerald-200"}>
                      {isDirty ? "Modified" : "Saved"}
                    </span>
                  </p>
                </div>
              </section>

              {error ? (
                <section className="rounded-lg border border-[#e95420]/50 bg-[#e95420]/14 p-5">
                  <h2 className="text-xl font-bold tracking-normal">Editor error</h2>
                  <p className="mt-2 text-sm leading-6 text-white/70">{error}</p>
                </section>
              ) : null}

              {message ? (
                <section className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-4">
                  <p className="text-sm font-semibold text-emerald-100">{message}</p>
                </section>
              ) : null}

              <section className="rounded-lg border border-white/10 bg-[#111111]/70 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-sm text-white/54">
                  <span>{lineCount} lines</span>
                  <span>{formatBytes(fileInfo?.size ?? content.length)}</span>
                  <span>
                    {fileInfo?.modifiedAt
                      ? new Date(fileInfo.modifiedAt).toLocaleString()
                      : "Not loaded"}
                  </span>
                </div>

                <textarea
                  className="min-h-[60vh] w-full resize-y rounded-md border border-white/10 bg-black/40 p-4 font-mono text-sm leading-6 text-white outline-none transition placeholder:text-white/30 focus:border-[#e95420]"
                  onChange={(event) => setContent(event.target.value)}
                  placeholder="Open a file to start editing..."
                  spellCheck={false}
                  value={content}
                />

                <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-white/48">
                  <span className="rounded bg-white/8 px-2 py-1">Ctrl+S: use Save button</span>
                  <span className="rounded bg-white/8 px-2 py-1">Open: load path</span>
                  <span className="rounded bg-white/8 px-2 py-1">Root: FILE_BROWSER_ROOT</span>
                </div>
              </section>

              <section className="rounded-lg border border-white/10 bg-[#111111]/70 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-bold tracking-normal">File Versions</h2>
                    <p className="mt-2 text-sm leading-6 text-white/56">
                      Backups are created before each successful save.
                    </p>
                  </div>
                  <button
                    className="h-10 rounded-md border border-white/14 px-4 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={isBackupBusy || !currentPath}
                    onClick={() => loadBackups(currentPath)}
                    type="button"
                  >
                    Refresh Versions
                  </button>
                </div>

                <div className="mt-5 grid gap-3">
                  {backups.length > 0 ? (
                    backups.map((backup) => (
                      <div
                        className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-white/10 bg-black/20 p-4"
                        key={backup.path}
                      >
                        <div className="min-w-0">
                          <p className="truncate font-mono text-sm text-white/82">{backup.name}</p>
                          <p className="mt-1 text-xs text-white/45">
                            {new Date(backup.createdAt).toLocaleString()} · {formatBytes(backup.size)}
                          </p>
                        </div>
                        <button
                          className="h-9 rounded-md bg-[#e95420] px-4 text-sm font-bold text-white transition hover:bg-[#c34113] disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={isBackupBusy}
                          onClick={() => restoreBackup(backup.path)}
                          type="button"
                        >
                          Restore
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="rounded-md bg-black/20 px-4 py-6 text-center text-sm text-white/58">
                      No backup versions found for this file.
                    </p>
                  )}
                </div>
              </section>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
