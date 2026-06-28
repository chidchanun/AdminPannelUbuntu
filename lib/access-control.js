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

export function canControlServices(username) {
  const serviceUsers = parseList(process.env.SERVICE_CONTROL_USERS);

  if (serviceUsers.length > 0) {
    return serviceUsers.includes(username);
  }

  return canRestartServices(username);
}

export function canManageFirewall(username) {
  const firewallUsers = parseList(process.env.FIREWALL_USERS);

  if (firewallUsers.length > 0) {
    return firewallUsers.includes(username);
  }

  return isAdminUser(username);
}

export function canInstallPackages(username) {
  const packageUsers = parseList(process.env.PACKAGE_INSTALL_USERS);

  if (packageUsers.length > 0) {
    return packageUsers.includes(username);
  }

  return isAdminUser(username);
}
