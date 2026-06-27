import path from "node:path";

const DEFAULT_ALLOWED_EXTENSIONS = [
  ".conf",
  ".css",
  ".env",
  ".html",
  ".ini",
  ".js",
  ".json",
  ".jsx",
  ".log",
  ".md",
  ".mjs",
  ".service",
  ".sh",
  ".text",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
];

const BLOCKED_BASENAMES = new Set([
  "authorized_keys",
  "id_dsa",
  "id_ecdsa",
  "id_ed25519",
  "id_rsa",
  "shadow",
  "sudoers",
]);

function parseExtensions() {
  const rawValue = process.env.FILE_EDITOR_ALLOWED_EXTENSIONS;

  if (rawValue === "*") {
    return ["*"];
  }

  return String(rawValue || DEFAULT_ALLOWED_EXTENSIONS.join(","))
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .map((item) => (item.startsWith(".") ? item : `.${item}`));
}

export function validateEditableFile(filePath) {
  const basename = path.basename(filePath).toLowerCase();
  const extension = path.extname(filePath).toLowerCase();
  const allowedExtensions = parseExtensions();

  if (BLOCKED_BASENAMES.has(basename)) {
    return {
      ok: false,
      reason: "This filename is blocked from the web editor.",
    };
  }

  if (basename.startsWith("id_") || basename.endsWith(".pem") || basename.endsWith(".key")) {
    return {
      ok: false,
      reason: "Private key files are blocked from the web editor.",
    };
  }

  if (allowedExtensions.includes("*")) {
    return { ok: true };
  }

  if (basename.startsWith(".env") && allowedExtensions.includes(".env")) {
    return { ok: true };
  }

  if (!allowedExtensions.includes(extension)) {
    return {
      ok: false,
      reason: `Only these file types can be edited: ${allowedExtensions.join(", ")}`,
    };
  }

  return { ok: true };
}
