import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { canWriteFiles, getSessionFromRequest } from "@/lib/access-control";
import { writeAuditLog } from "@/lib/audit-log";
import { validateEditableFile } from "@/lib/file-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getBrowserRoot() {
  return path.resolve(process.env.FILE_BROWSER_ROOT || path.parse(process.cwd()).root);
}

function resolveRequestedPath(rawPath) {
  const root = getBrowserRoot();
  const resolvedPath = path.resolve(rawPath || root);
  const relativePath = path.relative(root, resolvedPath);
  const isInsideRoot =
    relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));

  return { isAllowed: isInsideRoot, resolvedPath, root };
}

function getBackupDirectory(filePath) {
  const backupRoot = process.env.FILE_BACKUP_DIR;

  if (backupRoot) {
    return path.resolve(backupRoot);
  }

  return path.join(path.dirname(filePath), ".admin-backups");
}

function backupPrefix(filePath) {
  return `${path.basename(filePath)}.`;
}

async function listBackups(filePath) {
  const directory = getBackupDirectory(filePath);
  const prefix = backupPrefix(filePath);

  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const backups = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.startsWith(prefix) && entry.name.endsWith(".bak"))
        .map(async (entry) => {
          const backupPath = path.join(directory, entry.name);
          const stat = await fs.stat(backupPath);

          return {
            createdAt: stat.mtime.toISOString(),
            name: entry.name,
            path: backupPath,
            size: stat.size,
          };
        }),
    );

    return backups.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 50);
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

export async function GET(request) {
  const session = getSessionFromRequest(request);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const { isAllowed, resolvedPath, root } = resolveRequestedPath(searchParams.get("path"));

  if (!isAllowed) {
    return NextResponse.json({ error: "Requested path is outside file root.", root }, { status: 403 });
  }

  const editPolicy = validateEditableFile(resolvedPath);

  if (!editPolicy.ok) {
    return NextResponse.json({ error: editPolicy.reason, root }, { status: 403 });
  }

  return NextResponse.json({
    backups: await listBackups(resolvedPath),
    path: resolvedPath,
    root,
  });
}

export async function POST(request) {
  const session = getSessionFromRequest(request);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canWriteFiles(session.username)) {
    return NextResponse.json({ error: "File write permission denied." }, { status: 403 });
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const { isAllowed, resolvedPath, root } = resolveRequestedPath(body?.path);
  const backupPath = path.resolve(String(body?.backupPath || ""));

  if (!isAllowed) {
    return NextResponse.json({ error: "Requested path is outside file root.", root }, { status: 403 });
  }

  const editPolicy = validateEditableFile(resolvedPath);

  if (!editPolicy.ok) {
    return NextResponse.json({ error: editPolicy.reason, root }, { status: 403 });
  }

  const backups = await listBackups(resolvedPath);
  const selected = backups.find((backup) => backup.path === backupPath);

  if (!selected) {
    return NextResponse.json({ error: "Backup version was not found." }, { status: 404 });
  }

  try {
    await fs.copyFile(selected.path, resolvedPath);

    await writeAuditLog({
      action: "file.restore",
      backupPath: selected.path,
      path: resolvedPath,
      user: session.username,
    });

    return NextResponse.json({
      ok: true,
      path: resolvedPath,
      restoredAt: new Date().toISOString(),
      restoredFrom: selected.path,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message, path: resolvedPath, root }, { status: 500 });
  }
}
