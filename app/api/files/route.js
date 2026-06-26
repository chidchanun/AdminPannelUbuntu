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

export async function GET(request) {
  const session = readSessionValue(request.cookies.get(SESSION_COOKIE)?.value);

  if (!session) {
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
