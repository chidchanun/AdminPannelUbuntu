import { NextResponse } from "next/server";
import { getSessionFromRequest, isAdminUser } from "@/lib/access-control";
import { getAuditLogFilePath, readAuditLog } from "@/lib/audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const session = getSessionFromRequest(request);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAdminUser(session.username)) {
    return NextResponse.json({ error: "Audit log permission denied." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.max(1, Math.min(1000, Number(searchParams.get("limit")) || 200));

  try {
    const entries = await readAuditLog({ limit });

    return NextResponse.json({
      entries,
      limit,
      path: getAuditLogFilePath(),
      totalReturned: entries.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error.message,
        path: getAuditLogFilePath(),
      },
      { status: 500 },
    );
  }
}
