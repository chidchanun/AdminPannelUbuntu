import { createRequire } from "node:module";
import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit-log";
import {
  createSessionValue,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
} from "@/lib/auth-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const require = createRequire(import.meta.url);

function loadPamAuthenticator() {
  const packageName = "authenticate-pam";

  try {
    return require(packageName);
  } catch (error) {
    console.error("Unable to load authenticate-pam:", error);
    return null;
  }
}

async function authenticateUbuntuUser(username, password) {
  if (process.platform !== "linux") {
    return { ok: false, reason: "platform" };
  }

  const pamModule = loadPamAuthenticator();
  const authenticate = pamModule?.default?.authenticate ?? pamModule?.authenticate;

  if (!authenticate) {
    console.error(
      "PAM authentication is not configured. Install authenticate-pam on the Ubuntu server.",
    );

    return { ok: false, reason: "pam" };
  }

  return new Promise((resolve) => {
    authenticate(
      username,
      password,
      (error) => {
        if (error) {
          console.error("PAM login failed:", error);
          resolve({ ok: false, reason: "invalid" });
          return;
        }

        resolve({ ok: true });
      },
      {
        serviceName: process.env.PAM_SERVICE || "nextjs",
      },
    );
  });
}

function shouldUseSecureCookie(request) {
  if (process.env.AUTH_COOKIE_SECURE === "true") {
    return true;
  }

  if (process.env.AUTH_COOKIE_SECURE === "false") {
    return false;
  }

  const forwardedProto = request.headers.get("x-forwarded-proto");

  if (forwardedProto) {
    return forwardedProto.split(",")[0].trim() === "https";
  }

  return new URL(request.url).protocol === "https:";
}

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

function getAllowedUsers() {
  return String(process.env.LOGIN_ALLOWED_USERS || "ChidchanunServer")
    .split(",")
    .map((user) => user.trim())
    .filter(Boolean);
}

export async function POST(request) {
  const formData = await request.formData();
  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "");

  if (!username || !password) {
    await writeAuditLog({
      action: "login.failed",
      reason: "missing credentials",
      username,
    });

    return NextResponse.redirect(getPublicUrl(request, "/?error=missing"), 303);
  }

  if (!getAllowedUsers().includes(username)) {
    await writeAuditLog({
      action: "login.failed",
      reason: "user not allowlisted",
      username,
    });

    return NextResponse.redirect(getPublicUrl(request, "/?error=forbidden"), 303);
  }

  const result = await authenticateUbuntuUser(username, password);

  if (!result.ok) {
    await writeAuditLog({
      action: "login.failed",
      reason: result.reason,
      username,
    });

    return NextResponse.redirect(getPublicUrl(request, `/?error=${result.reason}`), 303);
  }

  const response = NextResponse.redirect(getPublicUrl(request, "/dashboard"), 303);

  response.cookies.set({
    name: SESSION_COOKIE,
    value: createSessionValue(username),
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookie(request),
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });

  await writeAuditLog({
    action: "login.success",
    user: username,
  });

  return response;
}
