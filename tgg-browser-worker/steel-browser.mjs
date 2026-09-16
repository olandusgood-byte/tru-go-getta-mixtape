import Steel from 'steel-sdk';
import { chromium } from 'playwright';

export async function launchSteelBrowser() {
  const apiKey = String(process.env.STEEL_API_KEY || '').trim();
  if (!apiKey) throw new Error('STEEL_API_KEY_REQUIRED');

  const clientOptions = { steelAPIKey: apiKey };
  const baseURL = String(process.env.STEEL_API_URL || '').trim();
  if (baseURL) clientOptions.baseURL = baseURL;

  const client = new Steel(clientOptions);
  const timeout = Number(process.env.TGG_STEEL_SESSION_TIMEOUT_MS || 900000);
  const session = await client.sessions.create({ timeout });

  let browser = null;
  try {
    browser = await chromium.connectOverCDP(`${session.websocketUrl}&apiKey=${encodeURIComponent(apiKey)}`);
    const context = browser.contexts()[0];
    if (!context) throw new Error('STEEL_CONTEXT_MISSING');
    return {
      browser,
      context,
      session_id: session.id,
      session_viewer_url: session.sessionViewerUrl || null,
      async close() {
        try { await browser?.close(); } finally { await client.sessions.release(session.id); }
      }
    };
  } catch (error) {
    try { if (browser) await browser.close(); } finally { await client.sessions.release(session.id); }
    throw error;
  }
}
