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
  btn.style.cssText = 'width:36px;padding:0;cursor:pointer;vertical-align:top;opacity:1;transition:opacity 0.2s;';

  // TubeSync icon (blue bookmark)
  btn.innerHTML = `
    <svg height="100%" viewBox="0 0 36 36" width="100%" xmlns="http://www.w3.org/2000/svg">
      <rect x="10" y="8" width="16" height="20" rx="2" fill="none" stroke="#fff" stroke-width="2"/>
      <path d="M10 8 h16 v12 l-8-5 -8 5 z" fill="#2373df"/>
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
