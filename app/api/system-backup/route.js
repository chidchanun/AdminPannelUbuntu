import { NextResponse } from "next/server";
import { getSessionFromRequest, isAdminUser } from "@/lib/access-control";
import { createSystemBackup, previewSystemBackup, restoreSystemBackup } from "@/lib/system-backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requireAdmin(request) {
  const session = getSessionFromRequest(request);

  if (!session) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  if (!isAdminUser(session.username)) {
    return {
      error: NextResponse.json({ error: "System backup permission denied." }, { status: 403 }),
    };
  }

  return { session };
}

function isEnabled(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
}

async function audit(event) {
  const { writeAuditLog } = await import("@/lib/audit-log");

  await writeAuditLog(event);
}

export async function GET(request) {
  const { error, session } = requireAdmin(request);

  if (error) {
    return error;
  }

  const url = new URL(request.url);
  const backup = await createSystemBackup({
    includeAudit: isEnabled(url.searchParams.get("includeAudit")),
    includeHistory: isEnabled(url.searchParams.get("includeHistory")),
  });
  const response = NextResponse.json(backup);

  response.headers.set("Content-Disposition", 'attachment; filename="ubuntu-admin-system-backup.json"');

  await audit({
    action: "system.backup.export",
    includeAudit: Boolean(backup.sections.auditLog),
    includeHistory: Boolean(backup.sections.healthHistory),
    user: session.username,
  });

  return response;
}

export async function POST(request) {
  const { error, session } = requireAdmin(request);

  if (error) {
    return error;
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  try {
    if (body?.action === "preview") {
      return NextResponse.json({
        ok: true,
        preview: previewSystemBackup(body.backup || body),
      });
    }

    const result = await restoreSystemBackup(body.backup || body, {
      restoreHistory: Boolean(body.restoreHistory),
    });

    if (result.restored.includes("securityBlocks")) {
      const { loadPersistentBlocks } = await import("@/lib/security-block-store");

      await loadPersistentBlocks();
    }

    await audit({
      action: "system.backup.restore",
      restored: result.restored,
      skipped: result.skipped,
      user: session.username,
    });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (restoreError) {
    return NextResponse.json({ error: restoreError.message }, { status: 400 });
  }
}
