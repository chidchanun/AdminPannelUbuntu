import { NextResponse } from "next/server";
import { getSessionFromRequest, isAdminUser } from "@/lib/access-control";
import { getAlertSettings } from "@/lib/admin-settings";
import { sendAlertWebhooks } from "@/lib/alert-webhooks";
import { writeAuditLog } from "@/lib/audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  const session = getSessionFromRequest(request);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAdminUser(session.username)) {
    return NextResponse.json({ error: "Webhook test permission denied." }, { status: 403 });
  }

  let body = {};

  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const current = await getAlertSettings();
  const settings = {
    discordBotEnabled:
      typeof body.discordBotEnabled === "boolean"
        ? body.discordBotEnabled
        : current.discordBotEnabled,
    discordBotToken: body.discordBotToken || current.discordBotToken,
    discordChannelId: body.discordChannelId || current.discordChannelId,
    discordUserIds: Array.isArray(body.discordUserIds)
      ? body.discordUserIds
      : current.discordUserIds,
    enabled: true,
    minSeverity: body.minSeverity || current.minSeverity,
    webhookUrls: Array.isArray(body.webhookUrls) ? body.webhookUrls : current.webhookUrls,
  };

  if (
    settings.webhookUrls.length === 0 &&
    (!settings.discordBotEnabled ||
      !settings.discordBotToken ||
      (!settings.discordChannelId && settings.discordUserIds.length === 0))
  ) {
    return NextResponse.json(
      { error: "Webhook URL or Discord bot settings are required." },
      { status: 400 },
    );
  }

  const results = await sendAlertWebhooks(
    [
      {
        at: new Date().toISOString(),
        detail: "Ubuntu Admin Panel webhook test message.",
        severity: "critical",
        source: "settings",
        title: "Webhook test",
      },
    ],
    settings,
    { bypassDedupe: true },
  );

  await writeAuditLog({
    action: "alert.webhook.test",
    results: results.map(({ ok, status, title }) => ({ ok, status, title })),
    user: session.username,
  });

  return NextResponse.json({
    ok: results.some((result) => result.ok),
    results,
  });
}
