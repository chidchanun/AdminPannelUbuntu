const SEVERITY_WEIGHT = {
  critical: 3,
  info: 1,
  warning: 2,
};

const DEDUPE_MS = 15 * 60 * 1000;

function getStore() {
  if (!globalThis.__adminPanelAlertWebhookStore) {
    globalThis.__adminPanelAlertWebhookStore = {
      sent: new Map(),
    };
  }

  return globalThis.__adminPanelAlertWebhookStore;
}

function shouldSend(notification, minSeverity) {
  return SEVERITY_WEIGHT[notification.severity] >= SEVERITY_WEIGHT[minSeverity];
}

function dedupeKey(notification) {
  return [
    notification.source,
    notification.severity,
    notification.title,
    notification.detail,
  ].join("|");
}

function cleanup(now = Date.now()) {
  const store = getStore();

  for (const [key, expiresAt] of store.sent.entries()) {
    if (expiresAt <= now) {
      store.sent.delete(key);
    }
  }
}

function buildPayload(notification) {
  const title = `[${String(notification.severity || "info").toUpperCase()}] ${notification.title}`;
  const detail = notification.detail ? `\n${notification.detail}` : "";
  const source = notification.source ? `\nSource: ${notification.source}` : "";
  const at = notification.at ? `\nAt: ${notification.at}` : "";
  const content = `${title}${detail}${source}${at}`;

  return {
    content,
    text: content,
    title,
    notification,
  };
}

export async function sendAlertWebhooks(notifications, settings) {
  if (!settings?.enabled || !Array.isArray(settings.webhookUrls) || settings.webhookUrls.length === 0) {
    return [];
  }

  cleanup();

  const store = getStore();
  const results = [];
  const targets = notifications
    .filter((notification) => shouldSend(notification, settings.minSeverity || "critical"))
    .slice(0, 10);

  for (const notification of targets) {
    const key = dedupeKey(notification);

    if (store.sent.has(key)) {
      continue;
    }

    store.sent.set(key, Date.now() + DEDUPE_MS);

    for (const webhookUrl of settings.webhookUrls) {
      try {
        const response = await fetch(webhookUrl, {
          body: JSON.stringify(buildPayload(notification)),
          headers: {
            "Content-Type": "application/json",
          },
          method: "POST",
        });

        results.push({
          ok: response.ok,
          status: response.status,
          title: notification.title,
          url: webhookUrl,
        });
      } catch (error) {
        results.push({
          error: error.message,
          ok: false,
          title: notification.title,
          url: webhookUrl,
        });
      }
    }
  }

  return results;
}
