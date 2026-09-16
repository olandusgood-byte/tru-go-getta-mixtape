import { chromium } from 'playwright';

const backend = String(process.env.TGG_BROWSER_BACKEND || 'local').trim().toLowerCase();

if (backend === 'steel') {
  const { default: Steel } = await import('steel-sdk');
  const apiKey = String(process.env.STEEL_API_KEY || '').trim();
  const baseURL = String(process.env.STEEL_API_URL || '').trim();

  if (!apiKey && !baseURL) throw new Error('STEEL_CONFIGURATION_REQUIRED');

  const clientOptions = {};
  if (apiKey) clientOptions.steelAPIKey = apiKey;
  if (baseURL) clientOptions.baseURL = baseURL;
  const client = new Steel(clientOptions);

  chromium.launch = async () => {
    const timeout = Number(process.env.TGG_STEEL_SESSION_TIMEOUT_MS || 900000);
    const session = await client.sessions.create({ timeout });
    let remoteBrowser = null;
    let released = false;

    const release = async () => {
      if (released) return;
      released = true;
      await client.sessions.release(session.id).catch(() => {});
    };

    try {
      let websocketUrl = session.websocketUrl;
      if (apiKey && !/[?&]apiKey=/.test(websocketUrl)) {
        websocketUrl += `${websocketUrl.includes('?') ? '&' : '?'}apiKey=${encodeURIComponent(apiKey)}`;
      }
      remoteBrowser = await chromium.connectOverCDP(websocketUrl);
      const context = remoteBrowser.contexts()[0];
      if (!context) throw new Error('STEEL_CONTEXT_MISSING');

      return {
        newContext: async () => context,
        close: async () => {
          try { await remoteBrowser.close(); } finally { await release(); }
        },
        session_id: session.id,
        session_viewer_url: session.sessionViewerUrl || null
      };
    } catch (error) {
      try { await remoteBrowser?.close(); } finally { await release(); }
      throw error;
    }
  };

  console.log(`TGG browser backend: Steel${baseURL ? ` (${baseURL})` : ''}`);
} else {
  console.log('TGG browser backend: local Playwright Chromium');
}

await import('./worker-v131.mjs');
