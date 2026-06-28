import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/access-control";
import { getTwoFactorSettings, setUserTwoFactor } from "@/lib/admin-settings";
import { writeAuditLog } from "@/lib/audit-log";
import { createTotpSecret, createTotpUri, verifyTotp } from "@/lib/totp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const session = getSessionFromRequest(request);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await getTwoFactorSettings();
  const userConfig = settings.users[session.username];

  return NextResponse.json({
    enabled: Boolean(userConfig?.enabled),
    username: session.username,
  });
}

export async function POST(request) {
  const session = getSessionFromRequest(request);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  if (body?.action === "generate") {
    const secret = createTotpSecret();

    await writeAuditLog({
      action: "two_factor.generate",
      user: session.username,
    });

    return NextResponse.json({
      secret,
      uri: createTotpUri({ secret, username: session.username }),
    });
  }

  if (body?.action === "enable") {
    const secret = String(body.secret || "").trim();

    if (!verifyTotp({ code: body.code, secret })) {
      return NextResponse.json({ error: "Invalid 2FA code." }, { status: 400 });
    }

    await setUserTwoFactor(session.username, {
      enabled: true,
      secret,
    });

    await writeAuditLog({
      action: "two_factor.enable",
      user: session.username,
    });

    return NextResponse.json({ enabled: true, ok: true });
  }

  if (body?.action === "disable") {
    await setUserTwoFactor(session.username, {
      enabled: false,
    });

    await writeAuditLog({
      action: "two_factor.disable",
      user: session.username,
    });

    return NextResponse.json({ enabled: false, ok: true });
  }

  return NextResponse.json({ error: "Unknown 2FA action." }, { status: 400 });
}
