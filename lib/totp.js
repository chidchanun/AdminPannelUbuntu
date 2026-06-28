import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;

function base32Encode(buffer) {
  let bits = "";
  let output = "";

  for (const byte of buffer) {
    bits += byte.toString(2).padStart(8, "0");
  }

  for (let index = 0; index < bits.length; index += 5) {
    const chunk = bits.slice(index, index + 5).padEnd(5, "0");

    output += BASE32_ALPHABET[parseInt(chunk, 2)];
  }

  return output;
}

function base32Decode(value) {
  const cleanValue = String(value || "").replace(/=+$/g, "").replace(/\s+/g, "").toUpperCase();
  let bits = "";
  const bytes = [];

  for (const character of cleanValue) {
    const index = BASE32_ALPHABET.indexOf(character);

    if (index === -1) {
      throw new Error("Invalid TOTP secret.");
    }

    bits += index.toString(2).padStart(5, "0");
  }

  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(parseInt(bits.slice(index, index + 8), 2));
  }

  return Buffer.from(bytes);
}

function hotp(secret, counter) {
  const key = base32Decode(secret);
  const counterBuffer = Buffer.alloc(8);

  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const digest = createHmac("sha1", key).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return String(code % 1000000).padStart(6, "0");
}

export function createTotpSecret() {
  return base32Encode(randomBytes(20));
}

export function createTotpUri({ issuer = "Ubuntu Admin Panel", secret, username }) {
  const label = encodeURIComponent(`${issuer}:${username}`);
  const params = new URLSearchParams({
    algorithm: "SHA1",
    digits: "6",
    issuer,
    period: String(STEP_SECONDS),
    secret,
  });

  return `otpauth://totp/${label}?${params.toString()}`;
}

export function verifyTotp({ code, secret, window = 1 }) {
  const cleanCode = String(code || "").replace(/\s+/g, "");

  if (!/^\d{6}$/.test(cleanCode) || !secret) {
    return false;
  }

  const currentCounter = Math.floor(Date.now() / 1000 / STEP_SECONDS);
  const codeBuffer = Buffer.from(cleanCode);

  for (let offset = -window; offset <= window; offset += 1) {
    const expected = hotp(secret, currentCounter + offset);
    const expectedBuffer = Buffer.from(expected);

    if (
      codeBuffer.length === expectedBuffer.length &&
      timingSafeEqual(codeBuffer, expectedBuffer)
    ) {
      return true;
    }
  }

  return false;
}
