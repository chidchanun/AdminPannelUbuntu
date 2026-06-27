const WINDOW_MS = 60 * 1000;
const SCAN_WINDOW_MS = 10 * 60 * 1000;
const DEFAULT_BLOCK_MS = 30 * 60 * 1000;
const RATE_LIMIT = Number(process.env.BOT_RATE_LIMIT_PER_MINUTE || 240);
const SCAN_LIMIT = Number(process.env.BOT_SCAN_LIMIT || 3);

const SUSPICIOUS_PATH_PATTERNS = [
  /^\/\.env(?:$|[/?#])/i,
  /^\/\.git(?:$|[/?#])/i,
  /^\/admin(?:$|[/?#])/i,
  /^\/api\/env(?:$|[/?#])/i,
  /^\/backup(?:$|[/?#])/i,
  /^\/config(?:$|[/?#])/i,
  /^\/phpmyadmin(?:$|[/?#])/i,
  /^\/server-status(?:$|[/?#])/i,
  /^\/wp-admin(?:$|[/?#])/i,
  /^\/wp-content(?:$|[/?#])/i,
  /^\/wp-login\.php(?:$|[/?#])/i,
  /\/\.\./,
  /\.(?:bak|old|sql|tar|tgz|zip)(?:$|[?#])/i,
];

function getStore() {
  if (!globalThis.__adminPanelThreatStore) {
    globalThis.__adminPanelThreatStore = {
      blocked: new Map(),
      requests: new Map(),
      scans: new Map(),
      events: [],
      whitelist: new Set(parseList(process.env.BOT_WHITELIST_IPS)),
    };
  }

  return globalThis.__adminPanelThreatStore;
}

function parseList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function ipv4ToNumber(ip) {
  const parts = String(ip).split(".");

  if (parts.length !== 4) {
    return null;
  }

  const bytes = parts.map((part) => Number(part));

  if (bytes.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)) {
    return null;
  }

  return bytes.reduce((result, byte) => (result << 8) + byte, 0) >>> 0;
}

function matchesCidr(ip, cidr) {
  const [range, bitsValue] = String(cidr).split("/");
  const bits = Number(bitsValue);
  const ipNumber = ipv4ToNumber(ip);
  const rangeNumber = ipv4ToNumber(range);

  if (ipNumber === null || rangeNumber === null || !Number.isInteger(bits) || bits < 0 || bits > 32) {
    return false;
  }

  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;

  return (ipNumber & mask) === (rangeNumber & mask);
}

function cleanup(now = Date.now()) {
  const store = getStore();

  for (const [ip, block] of store.blocked.entries()) {
    if (block.expiresAt <= now) {
      store.blocked.delete(ip);
    }
  }

  for (const [ip, bucket] of store.requests.entries()) {
    if (bucket.expiresAt <= now) {
      store.requests.delete(ip);
    }
  }

  for (const [ip, bucket] of store.scans.entries()) {
    if (bucket.expiresAt <= now) {
      store.scans.delete(ip);
    }
  }
}

function addEvent(event) {
  const store = getStore();

  store.events.unshift({
    at: new Date().toISOString(),
    ...event,
  });

  store.events = store.events.slice(0, 300);
}

function getBlockedIp(ip, now = Date.now()) {
  cleanup(now);

  return getStore().blocked.get(ip) || null;
}

export function setWhitelist(entries = []) {
  const envEntries = parseList(process.env.BOT_WHITELIST_IPS);
  const store = getStore();

  store.whitelist = new Set([...envEntries, ...entries].map((entry) => entry.trim()).filter(Boolean));
}

export function getWhitelist() {
  return [...getStore().whitelist].sort();
}

export function isWhitelistedIp(ip) {
  const whitelist = getStore().whitelist;

  if (!ip || ip === "unknown") {
    return false;
  }

  for (const entry of whitelist) {
    if (entry === ip || (entry.includes("/") && matchesCidr(ip, entry))) {
      return true;
    }
  }

  return false;
}

export function getClientIp(request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const cfIp = request.headers.get("cf-connecting-ip");

  return (
    cfIp ||
    realIp ||
    forwardedFor?.split(",")[0]?.trim() ||
    request.ip ||
    "unknown"
  );
}

export function isSuspiciousPath(pathname) {
  return SUSPICIOUS_PATH_PATTERNS.some((pattern) => pattern.test(pathname));
}

export function blockIp(ip, reason, details = {}, options = {}) {
  if (isWhitelistedIp(ip)) {
    addEvent({
      action: "ip.block.skipped",
      details,
      ip,
      reason: "whitelisted",
    });

    return null;
  }

  const now = Date.now();
  const expiresAt = options.expiresAt || now + (options.blockMs || DEFAULT_BLOCK_MS);
  const block = {
    blockedAt: options.blockedAt || new Date(now).toISOString(),
    details,
    expiresAt,
    expiresAtIso: new Date(expiresAt).toISOString(),
    ip,
    reason,
  };

  getStore().blocked.set(ip, block);

  addEvent({
    action: "ip.blocked",
    details,
    ip,
    reason,
  });

  return block;
}

export function unblockIp(ip) {
  const deleted = getStore().blocked.delete(ip);

  if (deleted) {
    addEvent({
      action: "ip.unblocked",
      ip,
      reason: "manual unblock",
    });
  }

  return deleted;
}

export function inspectRequest({ ip, pathname, method }) {
  if (isWhitelistedIp(ip)) {
    return {
      blocked: false,
      reason: "whitelisted",
      requestCount: 0,
    };
  }

  const now = Date.now();
  const blocked = getBlockedIp(ip, now);

  if (blocked) {
    return {
      blocked: true,
      reason: blocked.reason,
      status: 403,
    };
  }

  const store = getStore();
  const requestBucket = store.requests.get(ip) || {
    count: 0,
    expiresAt: now + WINDOW_MS,
  };

  requestBucket.count += 1;
  store.requests.set(ip, requestBucket);

  if (requestBucket.count > RATE_LIMIT) {
    blockIp(ip, "rate limit exceeded", {
      count: requestBucket.count,
      method,
      pathname,
      windowMs: WINDOW_MS,
    });

    return {
      blocked: true,
      reason: "rate limit exceeded",
      status: 429,
    };
  }

  if (isSuspiciousPath(pathname)) {
    const scanBucket = store.scans.get(ip) || {
      count: 0,
      examples: [],
      expiresAt: now + SCAN_WINDOW_MS,
    };

    scanBucket.count += 1;
    scanBucket.examples = [...scanBucket.examples, pathname].slice(-8);
    store.scans.set(ip, scanBucket);

    addEvent({
      action: "path.scan.detected",
      count: scanBucket.count,
      ip,
      pathname,
    });

    if (scanBucket.count >= SCAN_LIMIT) {
      blockIp(ip, "path scan detected", {
        count: scanBucket.count,
        examples: scanBucket.examples,
        windowMs: SCAN_WINDOW_MS,
      });

      return {
        blocked: true,
        reason: "path scan detected",
        status: 403,
      };
    }
  }

  return {
    blocked: false,
    requestCount: requestBucket.count,
  };
}

export function getThreatSnapshot() {
  cleanup();

  const store = getStore();

  return {
    blocked: [...store.blocked.values()].sort((a, b) => b.expiresAt - a.expiresAt),
    events: store.events,
    requests: [...store.requests.entries()].map(([ip, bucket]) => ({
      count: bucket.count,
      expiresAtIso: new Date(bucket.expiresAt).toISOString(),
      ip,
    })),
    scans: [...store.scans.entries()].map(([ip, bucket]) => ({
      count: bucket.count,
      examples: bucket.examples,
      expiresAtIso: new Date(bucket.expiresAt).toISOString(),
      ip,
    })),
    whitelist: getWhitelist(),
  };
}
