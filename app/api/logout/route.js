import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/access-control";
import { writeAuditLog } from "@/lib/audit-log";
import { SESSION_COOKIE } from "@/lib/auth-session";

export const runtime = "nodejs";

function getPublicUrl(request, pathname) {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost || request.headers.get("host");
  const fallbackUrl = new URL(pathname, request.url);

  if (!host) {
    return fallbackUrl;
  }

  const proto =
    forwardedProto?.split(",")[0].trim() || fallbackUrl.protocol.replace(":", "");

  return new URL(pathname, `${proto}://${host}`);
}

export async function POST(request) {
  const session = getSessionFromRequest(request);
  const response = NextResponse.redirect(getPublicUrl(request, "/"), 303);

  response.cookies.delete(SESSION_COOKIE);

  await writeAuditLog({
    action: "logout",
    user: session?.username || "unknown",
  });

  return response;
}
