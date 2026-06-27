import { readSessionValue, SESSION_COOKIE } from "@/lib/auth-session";

function parseList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getSessionFromRequest(request) {
  return readSessionValue(request.cookies.get(SESSION_COOKIE)?.value);
}

export function isAdminUser(username) {
  const adminUsers = parseList(process.env.ADMIN_USERS);

  return adminUsers.length === 0 || adminUsers.includes(username);
}

export function canWriteFiles(username) {
  const fileWriteUsers = parseList(process.env.FILE_WRITE_USERS);

  if (fileWriteUsers.length > 0) {
    return fileWriteUsers.includes(username);
  }

  return isAdminUser(username);
}

export function canRestartServices(username) {
  const serviceUsers = parseList(process.env.SERVICE_RESTART_USERS);

  if (serviceUsers.length > 0) {
    return serviceUsers.includes(username);
  }

  return isAdminUser(username);
}
