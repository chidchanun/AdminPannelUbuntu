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

function getMaxFileBytes() {
  return Number(process.env.FILE_EDITOR_MAX_BYTES || 1024 * 1024);
}

function resolveRequestedPath(rawPath) {
  const root = getBrowserRoot();
  const requestedPath = rawPath || root;
  const resolvedPath = path.resolve(requestedPath);
  const relativePath = path.relative(root, resolvedPath);
  const isInsideRoot =
    relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));

  if (!isInsideRoot) {
    return { root, resolvedPath: root, isAllowed: false };
  }

  return { root, resolvedPath, isAllowed: true };
}

function getBackupPath(filePath) {
  const backupRoot = process.env.FILE_BACKUP_DIR;
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const basename = path.basename(filePath);

  if (backupRoot) {
    return path.join(path.resolve(backupRoot), `${basename}.${timestamp}.bak`);
  }

  return path.join(path.dirname(filePath), ".admin-backups", `${basename}.${timestamp}.bak`);
}

async function createBackup(filePath) {
  const backupPath = getBackupPath(filePath);

  await fs.mkdir(path.dirname(backupPath), { recursive: true });
  await fs.copyFile(filePath, backupPath);

  return backupPath;
}

export async function GET(request) {
  const session = getSessionFromRequest(request);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const { root, resolvedPath, isAllowed } = resolveRequestedPath(searchParams.get("path"));

  if (!isAllowed) {
    return NextResponse.json(
      { error: "Requested path is outside the configured file browser root.", root },
      { status: 403 },
    );
  }

  const editPolicy = validateEditableFile(resolvedPath);

  if (!editPolicy.ok) {
    return NextResponse.json(
      { error: editPolicy.reason, path: resolvedPath, root },
      { status: 403 },
    );
  }

  try {
    const stat = await fs.stat(resolvedPath);

    if (!stat.isFile()) {
      return NextResponse.json(
        { error: "Requested path is not a file.", path: resolvedPath, root },
        { status: 400 },
      );
    }

    if (stat.size > getMaxFileBytes()) {
      return NextResponse.json(
        {
          error: `File is larger than the editor limit of ${getMaxFileBytes()} bytes.`,
          path: resolvedPath,
          root,
        },
        { status: 413 },
      );
    }

    const content = await fs.readFile(resolvedPath, "utf8");

    await writeAuditLog({
      action: "file.read",
      path: resolvedPath,
      user: session.username,
    });

    return NextResponse.json({
      root,
      path: resolvedPath,
      content,
      size: stat.size,
      modifiedAt: stat.mtime.toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message, path: resolvedPath, root },
      { status: 500 },
    );
  }
}

export async function PUT(request) {
  const session = getSessionFromRequest(request);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canWriteFiles(session.username)) {
    await writeAuditLog({
      action: "file.save.denied",
      reason: "write permission denied",
      user: session.username,
    });

    return NextResponse.json({ error: "File write permission denied." }, { status: 403 });
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const { root, resolvedPath, isAllowed } = resolveRequestedPath(body?.path);
  const content = String(body?.content ?? "");
  const contentBytes = Buffer.byteLength(content, "utf8");

  if (!isAllowed) {
    return NextResponse.json(
      { error: "Requested path is outside the configured file browser root.", root },
      { status: 403 },
    );
  }

  const editPolicy = validateEditableFile(resolvedPath);

  if (!editPolicy.ok) {
    await writeAuditLog({
      action: "file.save.denied",
      path: resolvedPath,
      reason: editPolicy.reason,
      user: session.username,
    });

    return NextResponse.json(
      { error: editPolicy.reason, path: resolvedPath, root },
      { status: 403 },
    );
  }

  if (contentBytes > getMaxFileBytes()) {
    return NextResponse.json(
      {
        error: `Content is larger than the editor limit of ${getMaxFileBytes()} bytes.`,
        path: resolvedPath,
        root,
      },
      { status: 413 },
    );
  }

  try {
    const stat = await fs.stat(resolvedPath);

    if (!stat.isFile()) {
      return NextResponse.json(
        { error: "Requested path is not a file.", path: resolvedPath, root },
        { status: 400 },
      );
    }

    const backupPath = await createBackup(resolvedPath);

    await fs.writeFile(resolvedPath, content, "utf8");

    await writeAuditLog({
      action: "file.save",
      backupPath,
      path: resolvedPath,
      size: contentBytes,
      user: session.username,
    });

    return NextResponse.json({
      backupPath,
      ok: true,
      root,
      path: resolvedPath,
      size: contentBytes,
      savedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message, path: resolvedPath, root },
      { status: 500 },
    );
  }
}
