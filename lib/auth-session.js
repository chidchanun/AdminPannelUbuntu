import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "ubuntu_admin_session";
export const SESSION_MAX_AGE = 60 * 60 * 8;

function getSessionSecret() {
  return process.env.AUTH_SECRET;
}

function signPayload(payload) {
  return createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
}

export function createSessionValue(username) {
  const expiresAt = Date.now() + SESSION_MAX_AGE * 1000;
  const payload = Buffer.from(JSON.stringify({ username, expiresAt })).toString("base64url");
  const signature = signPayload(payload);

  return `${payload}.${signature}`;
}

export function readSessionValue(value) {
  if (!value || !value.includes(".")) {
    return null;
  }

  const [payload, signature] = value.split(".");
  const expectedSignature = signPayload(payload);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));

    if (!session.username || Date.now() > session.expiresAt) {
      return null;
    }

    return session;
  } catch {
    return null;
  }
}
