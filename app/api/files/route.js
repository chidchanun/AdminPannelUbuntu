import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { readSessionValue, SESSION_COOKIE } from "@/lib/auth-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getBrowserRoot() {
  return path.resolve(process.env.FILE_BROWSER_ROOT || path.parse(process.cwd()).root);
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

function formatMode(mode) {
  return `0${(mode & 0o777).toString(8)}`;
}

function isAuthenticated(request) {
  return Boolean(readSessionValue(request.cookies.get(SESSION_COOKIE)?.value));
}

function isSafeEntryName(name) {
  return (
    typeof name === "string" &&
    name.trim().length > 0 &&
    !name.includes("/") &&
    !name.includes("\\") &&
    name !== "." &&
    name !== ".."
  );
}

export async function GET(request) {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const rawPath = searchParams.get("path");
  const { root, resolvedPath, isAllowed } = resolveRequestedPath(rawPath);

  if (!isAllowed) {
    return NextResponse.json(
      {
        error: "Requested path is outside the configured file browser root.",
        root,
      },
      { status: 403 },
    );
  }

  try {
    const stat = await fs.stat(resolvedPath);

    if (!stat.isDirectory()) {
      return NextResponse.json(
        {
          error: "Requested path is not a directory.",
          path: resolvedPath,
          root,
        },
        { status: 400 },
      );
    }

    const entries = await fs.readdir(resolvedPath, { withFileTypes: true });
    const items = await Promise.all(
      entries.map(async (entry) => {
        const itemPath = path.join(resolvedPath, entry.name);

        try {
          const itemStat = await fs.lstat(itemPath);

          return {
            name: entry.name,
            path: itemPath,
            type: entry.isDirectory()
              ? "directory"
              : entry.isSymbolicLink()
                ? "symlink"
                : "file",
            size: itemStat.size,
            modifiedAt: itemStat.mtime.toISOString(),
            mode: formatMode(itemStat.mode),
          };
        } catch (error) {
          return {
            name: entry.name,
            path: itemPath,
            type: "unknown",
            size: null,
            modifiedAt: null,
            mode: null,
            error: error.message,
          };
        }
      }),
    );

    items.sort((a, b) => {
      if (a.type === "directory" && b.type !== "directory") {
        return -1;
      }

      if (a.type !== "directory" && b.type === "directory") {
        return 1;
      }

      return a.name.localeCompare(b.name);
    });

    const parentPath = resolvedPath === root ? null : path.dirname(resolvedPath);

    return NextResponse.json({
      root,
      path: resolvedPath,
      parentPath,
      items,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error.message,
        root,
        path: resolvedPath,
      },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const { root, resolvedPath: directoryPath, isAllowed } = resolveRequestedPath(body?.directory);
  const name = String(body?.name || "").trim();
  const type = body?.type === "directory" ? "directory" : "file";

  if (!isAllowed) {
    return NextResponse.json(
      {
        error: "Requested path is outside the configured file browser root.",
        root,
      },
      { status: 403 },
    );
  }

  if (!isSafeEntryName(name)) {
    return NextResponse.json(
      {
        error: "Name must not be empty or contain path separators.",
      },
      { status: 400 },
    );
  }

  const targetPath = path.join(directoryPath, name);
  const targetRelativePath = path.relative(root, targetPath);

  if (targetRelativePath.startsWith("..") || path.isAbsolute(targetRelativePath)) {
    return NextResponse.json(
      {
        error: "Target path is outside the configured file browser root.",
        root,
      },
      { status: 403 },
    );
  }

  try {
    const directoryStat = await fs.stat(directoryPath);

    if (!directoryStat.isDirectory()) {
      return NextResponse.json(
        {
          error: "Target parent path is not a directory.",
          path: directoryPath,
          root,
        },
        { status: 400 },
      );
    }

    if (type === "directory") {
      await fs.mkdir(targetPath);
    } else {
      await fs.writeFile(targetPath, "", { flag: "wx" });
    }

    return NextResponse.json({
      ok: true,
      root,
      path: targetPath,
      type,
    });
  } catch (error) {
    const status = error.code === "EEXIST" ? 409 : 500;

    return NextResponse.json(
      {
        error: error.code === "EEXIST" ? "File or folder already exists." : error.message,
        root,
        path: targetPath,
      },
      { status },
    );
  }
}
