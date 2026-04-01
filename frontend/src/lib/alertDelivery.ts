/**
 * Alert delivery system for operator notifications.
 * Sends security alerts to configured webhooks (Slack, Discord, etc.)
 */
import { readEnv } from '@/lib/env';

interface AlertPayload {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  description: string;
  source: string;
  timestamp: string;
}

const SEVERITY_COLORS: Record<string, number> = {
  critical: 0xff0000,
  high: 0xff6600,
  medium: 0xffcc00,
  low: 0x00ccff,
  info: 0x999999,
};

const SEVERITY_EMOJI: Record<string, string> = {
  critical: '🚨',
  high: '🔴',
  medium: '🟡',
  low: '🔵',
  info: 'ℹ️',
};

function buildDiscordPayload(alert: AlertPayload) {
  return {
    embeds: [
      {
        title: `${SEVERITY_EMOJI[alert.severity] ?? ''} ${alert.title}`,
        description: alert.description.slice(0, 2000),
        color: SEVERITY_COLORS[alert.severity] ?? 0x999999,
        fields: [
          { name: 'Severity', value: alert.severity.toUpperCase(), inline: true },
          { name: 'Source', value: alert.source, inline: true },
          { name: 'Alert ID', value: alert.id, inline: true },
        ],
        timestamp: alert.timestamp,
        footer: { text: 'EliosBase Alert System' },
      },
    ],
  };
}

function buildSlackPayload(alert: AlertPayload) {
  return {
    text: `${SEVERITY_EMOJI[alert.severity] ?? ''} *${alert.title}*`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${SEVERITY_EMOJI[alert.severity] ?? ''} ${alert.title}*\n${alert.description.slice(0, 1000)}`,
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `*Severity:* ${alert.severity.toUpperCase()} | *Source:* ${alert.source} | *ID:* ${alert.id}`,
          },
        ],
      },
    ],
  };
}

/**
 * Deliver an alert to configured webhook(s).
 * Supports Discord and Slack webhook formats.
 * Silently fails if no webhook is configured.
 */
export async function deliverAlert(alert: AlertPayload): Promise<boolean> {
  const webhookUrl = readEnv(process.env.ALERT_WEBHOOK_URL);
  if (!webhookUrl) return false;

  try {
    // Auto-detect webhook type by URL
    const isDiscord = webhookUrl.includes('discord.com/api/webhooks');
    const payload = isDiscord ? buildDiscordPayload(alert) : buildSlackPayload(alert);

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.error(`[alert-delivery] Webhook returned ${res.status}: ${await res.text()}`);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[alert-delivery] Failed to deliver alert:', err);
    return false;
  }
}

/**
 * Check if alert delivery is configured.
 */
export function isAlertDeliveryConfigured(): boolean {
  return !!readEnv(process.env.ALERT_WEBHOOK_URL);
}
