import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth-session";

export const runtime = "nodejs";

export function POST(request) {
  const response = NextResponse.redirect(new URL("/", request.url), 303);

  response.cookies.delete(SESSION_COOKIE);

  return response;
}
