// src/content/youtube.tsx
// Content script injected into all youtube.com pages.
// Sends SAVE_VIDEO messages to the service worker with full metadata.

declare const chrome: any;

// ── Helpers ───────────────────────────────────────────────────────────────────

function getVideoId(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('v');
}

function getVideoTags(): string[] {
  // YouTube stores video tags in <meta name="keywords"> (comma-separated)
  const meta = document.querySelector('meta[name="keywords"]') as HTMLMetaElement | null;
  if (!meta?.content) return [];
  return meta.content.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 10);
}

function getVideoMetadata() {
  const videoId = getVideoId();
  const url = window.location.href;

  // Title: try the page <title> first, fall back to h1
  let title =
    (document.querySelector('h1.ytd-watch-metadata yt-formatted-string') as HTMLElement)?.innerText ||
    (document.querySelector('#title h1 yt-formatted-string') as HTMLElement)?.innerText ||
    document.title.replace(' - YouTube', '').trim();

  // Channel name — several possible selectors across YouTube's A/B tests
  const channel =
    (document.querySelector('ytd-video-owner-renderer #channel-name a') as HTMLElement)?.innerText ||
    (document.querySelector('#owner #channel-name a') as HTMLElement)?.innerText ||
    (document.querySelector('#upload-info #channel-name a') as HTMLElement)?.innerText ||
    (document.querySelector('ytd-channel-name#channel-name a') as HTMLElement)?.innerText ||
    '';

  // Thumbnail: YouTube always has this CDN URL for the current video
  const thumbnail = videoId
    ? `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`
    : '';

  // Tags from page meta keywords
  const tags = getVideoTags();

  return { url, title: title.trim(), channel: channel.trim(), thumbnail, videoId, tags };
}

// ── In-player Save Button ─────────────────────────────────────────────────────

let saveButtonInjected = false;

function injectSaveButton() {
  // Only inject on watch pages
  if (!window.location.pathname.startsWith('/watch')) {
    const existing = document.getElementById('tubesync-save-btn');
    if (existing) existing.remove();
    saveButtonInjected = false;
    return;
  }

  if (saveButtonInjected && document.getElementById('tubesync-save-btn')) return;

  const controls = document.querySelector('.ytp-right-controls');
  if (!controls) return;

  // Remove stale button (after SPA navigation)
  const stale = document.getElementById('tubesync-save-btn');
  if (stale) stale.remove();

  const btn = document.createElement('button');
  btn.id = 'tubesync-save-btn';
  btn.className = 'ytp-button';
  btn.title = 'Save to TubeSync';
  btn.style.cssText = 'width:36px;padding:0;cursor:pointer;vertical-align:top;opacity:1;transition:opacity 0.2s;display:inline-flex;align-items:center;justify-content:center;';

  // TubeSync icon SVG
  btn.innerHTML = `
    <svg width="100%" height="100%" viewBox="0 0 32 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M25.0264 0C28.8941 2.47762e-05 31.8516 2.60002 31.8516 6V38C31.8516 39.2 30.9413 40 29.5762 40C29.1215 40 28.8941 39.9996 28.4395 39.7998L15.9258 33.4004L3.41211 39.7998C2.27464 40.1996 0.91003 39.9998 0.227539 39C2.58173e-05 38.6 0 38.4 0 38V6C0 2.60002 2.9575 2.56568e-05 6.8252 0H25.0264ZM25.6953 3.05078C25.2577 2.87222 24.7538 2.97084 24.4189 3.30078L22.0625 5.62305C16.9429 3.08638 10.5416 3.92157 6.2666 8.13379C0.931979 13.3901 0.931979 21.9126 6.2666 27.1689C11.6012 32.4252 20.2503 32.4252 25.585 27.1689C28.6876 24.1117 29.985 19.9487 29.4795 15.9707C29.3991 15.3385 28.8135 14.8897 28.1719 14.9688C27.5306 15.0481 27.0761 15.6249 27.1562 16.2568C27.5757 19.5585 26.4987 23.0048 23.9287 25.5371C19.5086 29.8922 12.3429 29.8922 7.92285 25.5371C3.50272 21.1819 3.50272 14.1209 7.92285 9.76562C11.2677 6.47 16.187 5.66729 20.2979 7.36133L17.7959 9.82715C17.4611 10.157 17.3611 10.6529 17.542 11.084C17.7232 11.5149 18.1497 11.7967 18.623 11.7969H25.2471C25.8937 11.7968 26.418 11.2797 26.418 10.6426V4.11621C26.4178 3.64986 26.1326 3.22935 25.6953 3.05078ZM13.3389 11.4258C12.5735 10.9363 11.5794 11.4827 11.5791 12.3818V24.1758C11.5794 25.0748 12.5736 25.6219 13.3389 25.1328L22.6387 19.2354C23.3466 18.7913 23.3466 17.7669 22.6387 17.3115L13.3389 11.4258ZM18.5508 18.2744L14.5791 20.793V15.7607L18.5508 18.2744Z" fill="#ffffff"/>
    </svg>`;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const meta = getVideoMetadata();

    btn.style.opacity = '0.4';
    btn.title = 'Saving...';

    chrome.runtime.sendMessage(
      {
        type: 'SAVE_VIDEO',
        url: meta.url,
        title: meta.title,
        channel: meta.channel,
        thumbnail: meta.thumbnail,
        tags: meta.tags,
      },
      (res: any) => {
        if (res?.success) {
          btn.style.opacity = '1';
          btn.title = '✓ Saved to TubeSync!';
          setTimeout(() => { btn.title = 'Save to TubeSync'; }, 2500);
        } else {
          btn.style.opacity = '1';
          btn.title = `Error: ${res?.error ?? 'Unknown error'}`;
          setTimeout(() => { btn.title = 'Save to TubeSync'; }, 4000);
        }
      }
    );
  });

  controls.prepend(btn);
  saveButtonInjected = true;
}

// ── Video Progress Tracking ───────────────────────────────────────────────────

let progressListenerAttached = false;

function trackVideoProgress() {
  if (progressListenerAttached) return;

  const video = document.querySelector('video.html5-main-video') as HTMLVideoElement | null;
  if (!video) return;

  progressListenerAttached = true;

  video.addEventListener('timeupdate', () => {
    if (video.duration > 0 && video.currentTime / video.duration > 0.95) {
      if (!video.dataset.tubeSyncArchived) {
        video.dataset.tubeSyncArchived = 'true';
        chrome.runtime.sendMessage({
          type: 'AUTO_ARCHIVE_VIDEO',
          url: window.location.href,
        });
      }
    }
  });

  // Reset tracking flag when video src changes (SPA navigation)
  video.addEventListener('emptied', () => {
    progressListenerAttached = false;
    delete video.dataset.tubeSyncArchived;
  });
}

// ── SPA Navigation Observer ───────────────────────────────────────────────────

let lastUrl = '';

const navObserver = new MutationObserver(() => {
  const currentUrl = window.location.href;
  if (currentUrl !== lastUrl) {
    lastUrl = currentUrl;
    saveButtonInjected = false;
    progressListenerAttached = false;
  }
  injectSaveButton();
  trackVideoProgress();
});

navObserver.observe(document.documentElement, { childList: true, subtree: true });

// Initial call
injectSaveButton();
trackVideoProgress();
