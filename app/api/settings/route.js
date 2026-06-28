import { NextResponse } from "next/server";
import { getSessionFromRequest, isAdminUser } from "@/lib/access-control";
import { getServiceSettings, updateServiceSettings } from "@/lib/admin-settings";
import { writeAuditLog } from "@/lib/audit-log";
import { getSecuritySettings, updateSecuritySettings } from "@/lib/security-block-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requireAdmin(request) {
  const session = getSessionFromRequest(request);

  if (!session) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  if (!isAdminUser(session.username)) {
    return {
      error: NextResponse.json({ error: "Settings permission denied." }, { status: 403 }),
    };
  }

  return { session };
}

export async function GET(request) {
  const { error } = requireAdmin(request);

  if (error) {
    return error;
  }

  const [service, security] = await Promise.all([
    getServiceSettings(),
    getSecuritySettings(),
  ]);

  return NextResponse.json({
    security,
    service,
    updatedAt: new Date().toISOString(),
  });
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

  const updates = {};

  if (body?.service) {
    updates.service = await updateServiceSettings(body.service);
  }

  if (body?.security) {
    updates.security = await updateSecuritySettings(body.security);
  }

  await writeAuditLog({
    action: "settings.update",
    sections: Object.keys(updates),
    user: session.username,
  });

  return NextResponse.json({
    ok: true,
    ...updates,
    updatedAt: new Date().toISOString(),
  });
}
