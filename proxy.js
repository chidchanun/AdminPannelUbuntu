import { NextResponse } from "next/server";
import { getClientIp, inspectRequest } from "@/lib/threat-guard";

export function proxy(request) {
  const ip = getClientIp(request);
  const result = inspectRequest({
    ip,
    method: request.method,
    pathname: request.nextUrl.pathname,
  });

  if (result.blocked) {
    return NextResponse.json(
      {
        error: "Request blocked by security guard.",
        reason: result.reason,
      },
      { status: result.status },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
