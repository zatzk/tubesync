// src/background/index.ts  – Service Worker
const NOTION_CLIENT_ID = import.meta.env.VITE_NOTION_CLIENT_ID as string;
const NOTION_CLIENT_SECRET = import.meta.env.VITE_NOTION_CLIENT_SECRET as string;
const NOTION_API_VERSION = '2022-06-28';

// ── YouTube oEmbed: fetches title, channel, thumbnail from a YT URL (no API key needed) ──
async function fetchYouTubeMetadata(url: string): Promise<{ title: string; channel: string; thumbnail: string }> {
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const res = await fetch(oembedUrl);
    if (res.ok) {
      const d = await res.json();
      return {
        title: d.title ?? '',
        channel: d.author_name ?? '',
        thumbnail: d.thumbnail_url ?? '',
      };
    }
  } catch { /* network error, continue with fallback */ }

  // Fallback: extract video ID from URL for thumbnail
  const ytId = new URL(url).searchParams.get('v');
  return {
    title: '',
    channel: '',
    thumbnail: ytId ? `https://i.ytimg.com/vi/${ytId}/mqdefault.jpg` : '',
  };
}

// ── Context Menu ─────────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'save-to-tubesync',
    title: 'Save to TubeSync',
    contexts: ['link', 'page', 'video'],
    documentUrlPatterns: ['*://*.youtube.com/*'],
  });
});

chrome.contextMenus.onClicked.addListener((info: chrome.contextMenus.OnClickData) => {
  if (info.menuItemId !== 'save-to-tubesync') return;
  const url = info.linkUrl || info.pageUrl;
  if (!url) return;

  chrome.storage.local.get(['notion_token', 'notion_database_id'], async (r: Record<string, any>) => {
    if (r.notion_token && r.notion_database_id) {
      try {
        // Fetch full metadata via oEmbed since we only have the URL
        const meta = await fetchYouTubeMetadata(url);
        await _saveVideoToNotion(r.notion_token, r.notion_database_id, url, meta.title, meta.channel, meta.thumbnail, []);
        // Broadcast so the dashboard refreshes
        chrome.runtime.sendMessage({ type: 'VIDEO_SAVED' }).catch(() => { });
        console.log('[TubeSync] Context menu save succeeded:', url);
      } catch (e: any) {
        console.error('[TubeSync] Context menu save failed:', e.message);
      }
    } else {
      console.warn('[TubeSync] Not configured.');
    }
  });
});

// ── Message Router ────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg: any, _sender, sendResponse) => {
  (async () => {
    try {
      switch (msg.type) {

        // ── OAuth ──
        case 'NOTION_AUTH': {
          const redirectUrl = chrome.identity.getRedirectURL();
          const authUrl =
            `https://api.notion.com/v1/oauth/authorize?client_id=${NOTION_CLIENT_ID}` +
            `&response_type=code&owner=user&redirect_uri=${encodeURIComponent(redirectUrl)}`;
          chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, async (returnUrl?: string) => {
            if (chrome.runtime.lastError || !returnUrl) {
              sendResponse({ success: false, error: chrome.runtime.lastError?.message ?? 'Auth cancelled' });
              return;
            }
            const code = new URL(returnUrl).searchParams.get('code');
            if (!code) { sendResponse({ success: false, error: 'No code returned' }); return; }
            try {
              const creds = btoa(`${NOTION_CLIENT_ID}:${NOTION_CLIENT_SECRET}`);
              const res = await fetch('https://api.notion.com/v1/oauth/token', {
                method: 'POST',
                headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ grant_type: 'authorization_code', code, redirect_uri: redirectUrl }),
              });
              const data = await res.json();
              if (data.access_token) {
                await chrome.storage.local.set({
                  notion_token: data.access_token,
                  workspace_name: data.workspace_name ?? 'Workspace',
                  workspace_icon: data.workspace_icon ?? '',
                  workspace_id: data.workspace_id ?? '',
                  bot_id: data.bot_id ?? '',
                });
                sendResponse({ success: true, workspace: data.workspace_name });
              } else {
                sendResponse({ success: false, error: JSON.stringify(data) });
              }
            } catch (e: any) {
              sendResponse({ success: false, error: e.message });
            }
          });
          return true;
        }

        // ── Disconnect ──
        case 'DISCONNECT': {
          await chrome.storage.local.clear();
          sendResponse({ success: true });
          break;
        }

        // ── List user's Notion DBs ──
        case 'GET_DATABASES': {
          const s = await chrome.storage.local.get('notion_token');
          const token = s.notion_token as string | undefined;
          if (!token) { sendResponse({ success: false, error: 'Not authenticated' }); break; }
          const res = await fetch('https://api.notion.com/v1/search', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Notion-Version': NOTION_API_VERSION,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ filter: { value: 'database', property: 'object' } }),
          });
          if (!res.ok) {
            const err = await res.json();
            sendResponse({ success: false, error: err.message ?? 'Failed to list databases' });
            break;
          }
          const data = await res.json();
          sendResponse({ success: true, databases: data.results ?? [] });
          break;
        }

        // ── Set active DB ──
        case 'SET_DATABASE': {
          await chrome.storage.local.set({
            notion_database_id: msg.databaseId,
            notion_database_name: msg.databaseName,
          });
          sendResponse({ success: true });
          break;
        }

        // ── Create template DB ──
        case 'CREATE_TEMPLATE_DB': {
          const s = await chrome.storage.local.get(['notion_token']);
          const token = s.notion_token as string | undefined;
          if (!token) { sendResponse({ success: false, error: 'Not authenticated' }); break; }

          const searchRes = await fetch('https://api.notion.com/v1/search', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Notion-Version': NOTION_API_VERSION,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              filter: { value: 'page', property: 'object' },
              sort: { direction: 'descending', timestamp: 'last_edited_time' },
              page_size: 10,
            }),
          });
          const searchData = await searchRes.json();
          const pages: any[] = searchData.results ?? [];
          const parentPageId = pages.find((p: any) => !p.parent?.page_id)?.id ?? pages[0]?.id;

          if (!parentPageId) {
            sendResponse({
              success: false,
              error: 'No accessible Notion pages found.\n\nPlease share at least one page with the TubeSync integration, then try again.',
            });
            break;
          }

          const dbRes = await fetch('https://api.notion.com/v1/databases', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Notion-Version': NOTION_API_VERSION,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              parent: { type: 'page_id', page_id: parentPageId },
              is_inline: false,
              title: [{ type: 'text', text: { content: 'TubeSync Watch Later' } }],
              properties: {
                // "Name" is the default Notion title property
                Title: { title: {} },
                URL: { url: {} },
                Channel: { rich_text: {} },
                Status: {
                  select: {
                    options: [
                      { name: 'To Watch', color: 'blue' },
                      { name: 'Archived', color: 'default' },
                    ],
                  },
                },
                Tags: { multi_select: {} },
                Reference: { checkbox: {} },
                'Added On': { date: {} },
              },
            }),
          });

          const db = await dbRes.json();
          if (!dbRes.ok) {
            sendResponse({ success: false, error: db.message ?? JSON.stringify(db) });
            break;
          }

          await chrome.storage.local.set({
            notion_database_id: db.id,
            notion_database_name: 'TubeSync Watch Later',
          });
          sendResponse({ success: true, databaseId: db.id, databaseName: 'TubeSync Watch Later' });
          break;
        }

        // ── Get videos from active DB ──
        case 'GET_VIDEOS': {
          const s = await chrome.storage.local.get(['notion_token', 'notion_database_id']);
          const token = s.notion_token as string | undefined;
          const dbId = s.notion_database_id as string | undefined;
          if (!token || !dbId) {
            sendResponse({ success: false, error: 'Not configured', videos: [] });
            break;
          }

          let bodyPayload: any = { page_size: 50 };
          if (msg.tab === 'Reference') {
            bodyPayload.filter = { property: 'Reference', checkbox: { equals: true } };
          } else {
            bodyPayload.filter = {
              or: [
                { property: 'Status', select: { equals: 'To Watch' } },
                { property: 'Status', select: { is_empty: true } },
              ],
            };
            bodyPayload.sorts = [{ timestamp: 'created_time', direction: 'descending' }];
          }

          const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Notion-Version': NOTION_API_VERSION,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(bodyPayload),
          });

          if (!res.ok) {
            const err = await res.json();
            sendResponse({ success: false, error: err.message ?? 'Failed to fetch videos', videos: [] });
            break;
          }

          const data = await res.json();
          const videos = (data.results ?? []).map((p: any) => {
            // Thumbnail: from page cover if set, else derive from URL
            let thumbnail = '';
            if (p.cover?.type === 'external') thumbnail = p.cover.external.url;
            else if (p.cover?.type === 'file') thumbnail = p.cover.file.url;
            if (!thumbnail) {
              const videoUrl = p.properties?.URL?.url ?? '';
              try {
                const ytId = new URL(videoUrl).searchParams.get('v');
                if (ytId) thumbnail = `https://i.ytimg.com/vi/${ytId}/mqdefault.jpg`;
              } catch { /* ignore */ }
            }
            return {
              id: p.id,
              title:
                p.properties?.Title?.title?.[0]?.plain_text ??
                p.properties?.Name?.title?.[0]?.plain_text ??
                'Untitled',
              url: p.properties?.URL?.url ?? '',
              channel: p.properties?.Channel?.rich_text?.[0]?.plain_text ?? '',
              status: p.properties?.Status?.select?.name ?? 'To Watch',
              reference: p.properties?.Reference?.checkbox ?? false,
              tags: (p.properties?.Tags?.multi_select ?? []).map((t: any) => t.name),
              addedOn: p.properties?.['Added On']?.date?.start ?? '',
              thumbnail,
            };
          });
          sendResponse({ success: true, videos });
          break;
        }

        // ── Save a video (from popup URL input OR in-player button) ──
        case 'SAVE_VIDEO': {
          const s = await chrome.storage.local.get(['notion_token', 'notion_database_id']);
          const token = s.notion_token as string | undefined;
          const dbId = s.notion_database_id as string | undefined;
          if (!token) { sendResponse({ success: false, error: 'Not authenticated — connect Notion first.' }); break; }
          if (!dbId) { sendResponse({ success: false, error: 'No database selected — complete setup first.' }); break; }

          let { title, channel, thumbnail, tags } = msg;

          // If title/channel are missing (e.g. manual URL paste), fetch via oEmbed
          if (!title || !channel) {
            const meta = await fetchYouTubeMetadata(msg.url as string);
            title = title || meta.title;
            channel = channel || meta.channel;
            thumbnail = thumbnail || meta.thumbnail;
          }

          await _saveVideoToNotion(
            token, dbId,
            msg.url as string,
            title,
            channel,
            thumbnail,
            tags ?? [],
          );

          // Broadcast refresh event so popup updates instantly
          chrome.runtime.sendMessage({ type: 'VIDEO_SAVED' }).catch(() => { });
          sendResponse({ success: true });
          break;
        }

        // ── Toggle Reference checkbox (heart button) ──
        case 'TOGGLE_REFERENCE': {
          const s = await chrome.storage.local.get('notion_token');
          const token = s.notion_token as string | undefined;
          if (!token || !msg.pageId) { sendResponse({ success: false, error: 'Missing token or pageId' }); break; }
          await fetch(`https://api.notion.com/v1/pages/${msg.pageId}`, {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${token}`,
              'Notion-Version': NOTION_API_VERSION,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ properties: { Reference: { checkbox: msg.value } } }),
          });
          sendResponse({ success: true });
          break;
        }

        // ── Auto-archive video after 90% watched ──
        case 'AUTO_ARCHIVE_VIDEO': {
          const s = await chrome.storage.local.get(['notion_token', 'notion_database_id', 'auto_archive']);
          if (!s.auto_archive) { sendResponse({ success: false }); break; }
          const token = s.notion_token as string | undefined;
          const dbId = s.notion_database_id as string | undefined;
          if (!token || !dbId || !msg.url) { sendResponse({ success: false }); break; }

          const qRes = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Notion-Version': NOTION_API_VERSION,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              filter: { property: 'URL', url: { equals: msg.url } },
              page_size: 1,
            }),
          });
          const qData = await qRes.json();
          const page = qData.results?.[0];
          if (!page) { sendResponse({ success: false }); break; }

          await fetch(`https://api.notion.com/v1/pages/${page.id}`, {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${token}`,
              'Notion-Version': NOTION_API_VERSION,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ properties: { Status: { select: { name: 'Archived' } } } }),
          });
          sendResponse({ success: true });
          break;
        }

        // ── Mark watched (legacy, kept for compatibility) ──
        case 'MARK_WATCHED': {
          const s = await chrome.storage.local.get('notion_token');
          const token = s.notion_token as string | undefined;
          if (!token || !msg.pageId) { sendResponse({ success: false }); break; }
          await fetch(`https://api.notion.com/v1/pages/${msg.pageId}`, {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${token}`,
              'Notion-Version': NOTION_API_VERSION,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ properties: { Status: { select: { name: 'Archived' } } } }),
          });
          sendResponse({ success: true });
          break;
        }

        // ── Pop-out ──
        case 'OPEN_POPOUT': {
          chrome.windows.create({
            url: chrome.runtime.getURL('index.html'),
            type: 'popup',
            width: 400,
            height: 660,
          });
          sendResponse({ success: true });
          break;
        }

        // ── Update settings ──
        case 'UPDATE_SETTINGS': {
          await chrome.storage.local.set({
            auto_archive: msg.auto_archive,
            player_integration: msg.player_integration,
          });
          sendResponse({ success: true });
          break;
        }

        default:
          sendResponse({ success: false, error: `Unknown message type: ${msg.type}` });
      }
    } catch (e: any) {
      console.error('[TubeSync] Message handler error:', e);
      sendResponse({ success: false, error: e.message });
    }
  })();
  return true;
});

// ── Helper: Write a video page to Notion ─────────────────────────────────────
async function _saveVideoToNotion(
  token: string,
  dbId: string,
  url: string,
  title?: string,
  channel?: string,
  thumbnail?: string,
  tags?: string[],
) {
  // Derive title from URL if still missing
  if (!title) {
    try {
      const ytId = new URL(url).searchParams.get('v');
      title = ytId ? `YouTube Video (${ytId})` : url;
    } catch { title = 'New Video'; }
  }

  const properties: any = {
    Title: { title: [{ text: { content: title } }] },
    URL: { url },
    Status: { select: { name: 'To Watch' } },
    'Added On': { date: { start: new Date().toISOString().split('T')[0] } },  // today YYYY-MM-DD
  };

  if (channel) {
    properties.Channel = { rich_text: [{ text: { content: channel } }] };
  }

  if (tags && tags.length > 0) {
    properties.Tags = { multi_select: tags.map((t) => ({ name: t })) };
  }

  // Thumbnail becomes the Notion page cover
  const cover = thumbnail
    ? { type: 'external', external: { url: thumbnail } }
    : undefined;

  const body: any = {
    parent: { database_id: dbId },
    properties,
    ...(cover ? { cover } : {}),
  };

  const res = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_API_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message ?? `HTTP ${res.status}`);
  }

  return await res.json();
}
