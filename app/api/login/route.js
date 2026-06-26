import { NextResponse } from "next/server";
import { createRequire } from "node:module";
import {
  createSessionValue,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
} from "@/lib/auth-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const require = createRequire(import.meta.url);

function loadPamAuthenticator() {
  try {
    return require("authenticate-pam");
  } catch (error) {
    console.error("Unable to load authenticate-pam:", error);
    return null;
  }
}

function authenticateUbuntuUser(username, password) {
  if (process.platform !== "linux") {
    return Promise.resolve({ ok: false, reason: "platform" });
  }

  const pamModule = loadPamAuthenticator();
  const authenticate = pamModule?.authenticate;

  if (!authenticate) {
    console.error(
      "PAM authentication is not configured. Install authenticate-pam on the Ubuntu server."
    );

    return Promise.resolve({ ok: false, reason: "pam" });
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
      }
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
    forwardedProto?.split(",")[0].trim() ||
    fallbackUrl.protocol.replace(":", "");

  return new URL(pathname, `${proto}://${host}`);
}

export async function POST(request) {
  const formData = await request.formData();

  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "");

  if (!username || !password) {
    return NextResponse.redirect(
      getPublicUrl(request, "/?error=missing"),
      303
    );
  }

  // แนะนำให้จำกัด user ที่ล็อกอินได้
  const allowedUsers = ["ChidchanunServer"];

  if (!allowedUsers.includes(username)) {
    return NextResponse.redirect(
      getPublicUrl(request, "/?error=forbidden"),
      303
    );
  }

  const result = await authenticateUbuntuUser(username, password);

  if (!result.ok) {
    return NextResponse.redirect(
      getPublicUrl(request, `/?error=${result.reason}`),
      303
    );
  }

  const response = NextResponse.redirect(
    getPublicUrl(request, "/dashboard"),
    303
  );

  response.cookies.set({
    name: SESSION_COOKIE,
    value: createSessionValue(username),
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookie(request),
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });

  return response;
}