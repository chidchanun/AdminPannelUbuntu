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

async function sendDiscordBotMessage(notification, settings) {
  const payload = buildPayload(notification);
  const response = await fetch(
    `https://discord.com/api/v10/channels/${settings.discordChannelId}/messages`,
    {
      body: JSON.stringify({
        content: payload.content,
      }),
      headers: {
        Authorization: `Bot ${settings.discordBotToken}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    },
  );

  return {
    ok: response.ok,
    status: response.status,
    target: "discord-bot",
    title: notification.title,
  };
}

async function createDiscordDmChannel(userId, botToken) {
  const response = await fetch("https://discord.com/api/v10/users/@me/channels", {
    body: JSON.stringify({
      recipient_id: userId,
    }),
    headers: {
      Authorization: `Bot ${botToken}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || !payload.id) {
    throw new Error(payload.message || `Unable to create Discord DM channel (${response.status}).`);
  }

  return payload.id;
}

async function sendDiscordBotDm(notification, settings, userId) {
  const channelId = await createDiscordDmChannel(userId, settings.discordBotToken);
  const payload = buildPayload(notification);
  const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    body: JSON.stringify({
      content: payload.content,
    }),
    headers: {
      Authorization: `Bot ${settings.discordBotToken}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  return {
    ok: response.ok,
    status: response.status,
    target: "discord-dm",
    title: notification.title,
    userId,
  };
}

export async function sendAlertWebhooks(notifications, settings, { bypassDedupe = false } = {}) {
  const hasWebhookUrls = Array.isArray(settings?.webhookUrls) && settings.webhookUrls.length > 0;
  const hasDiscordChannel = Boolean(settings?.discordBotEnabled && settings.discordBotToken && settings.discordChannelId);
  const hasDiscordDms = Boolean(
    settings?.discordBotEnabled &&
      settings.discordBotToken &&
      Array.isArray(settings.discordUserIds) &&
      settings.discordUserIds.length > 0,
  );
  const hasDiscordBot = Boolean(
    hasDiscordChannel || hasDiscordDms,
  );

  if (!settings?.enabled || (!hasWebhookUrls && !hasDiscordBot)) {
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

    if (!bypassDedupe && store.sent.has(key)) {
      continue;
    }

    if (!bypassDedupe) {
      store.sent.set(key, Date.now() + DEDUPE_MS);
    }

    for (const webhookUrl of settings.webhookUrls || []) {
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

    if (hasDiscordChannel) {
      try {
        results.push(await sendDiscordBotMessage(notification, settings));
      } catch (error) {
        results.push({
          error: error.message,
          ok: false,
          target: "discord-bot",
          title: notification.title,
        });
      }
    }

    if (hasDiscordDms) {
      for (const userId of settings.discordUserIds) {
        try {
          results.push(await sendDiscordBotDm(notification, settings, userId));
        } catch (error) {
          results.push({
            error: error.message,
            ok: false,
            target: "discord-dm",
            title: notification.title,
            userId,
          });
        }
      }
    }
  }

  return results;
}
