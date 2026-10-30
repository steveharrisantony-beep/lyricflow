import { useEffect, useState } from 'react';
import { musicBackendBase } from '../network/backend';

/**
 * Dual-Engine YouTube AdBlocker:
 * 1. `0xERR0R/blocky` Engine:
 *    - DNS/Host denylists (`ads`, `youtube_telemetry`, `trackers`) + allowlists (`youtube_core`)
 *      modeled after Blocky's `blocking.denylists` & `blocking.clientGroupsBlock`.
 *    - URL path & query-parameter sinkhole for YouTube ad-serving endpoints (`/api/stats/ads`,
 *      `/pagead/`, `/ptracking`, `/get_midroll_info`, `/youtubei/v1/player/ad_break`, `adformat=`).
 * 2. `TheRealJoelmatic/RemoveAdblockThing` Engine (`Youtube-Ad-blocker-Reminder-Remover.user.js`):
 *    - `adblocker()`: Detects active video ads (`.ad-showing`, `.ad-interrupting`, `.video-ads`),
 *      fast-forwards (`playbackRate = 16`, `currentTime = duration`), clicks skip buttons
 *      (`.ytp-ad-skip-button`, `.ytp-ad-skip-button-modern`, `.ytp-skip-ad-button`), and strips
 *      `adPlacements`, `playerAds`, `adSlots` from player responses.
 *    - `removePopup()`: Neutralizes `ytd-enforcement-message-view-model`,
 *      `bkaEnforcementMessageViewModel`, `tp-yt-iron-overlay-backdrop`, and
 *      `window.__ytplayer_adblockDetected`, automatically resuming paused playback.
 */

export interface BlockyConfig {
  enabled: boolean;
  denylists: {
    ads: readonly string[];
    youtubeTelemetry: readonly string[];
    trackers: readonly string[];
  };
  allowlists: {
    youtubeCore: readonly string[];
  };
  clientGroupsBlock: {
    default: readonly ('ads' | 'youtubeTelemetry' | 'trackers')[];
  };
}

export interface RemoveAdblockThingConfig {
  enabled: boolean;
  adblocker: boolean;
  removePopup: boolean;
  skipEmbeddedAdClips: boolean;
}

export interface YouTubeAdBlockerState {
  enabled: boolean;
  blockyEnabled: boolean;
  removeAdblockThingEnabled: boolean;
  skipEmbeddedAdsEnabled: boolean;
  blockedRequestsCount: number;
  skippedAdsCount: number;
  removedPopupsCount: number;
  lastBlockedDomain: string;
  blockyRulesCount: number;
}

/**
 * Curated `0xERR0R/blocky` denylists (aggregated from StevenBlack/hosts, Disconnect.me simple_ad,
 * and uBlock/EasyList YouTube ad & telemetry hosts).
 */
export const BLOCKY_ADS_DENYLIST: readonly string[] = [
  'doubleclick.net',
  'googlesyndication.com',
  'googleadservices.com',
  'adservice.google.com',
  'adservice.google.co.in',
  'adservice.google.co.uk',
  'pagead2.googlesyndication.com',
  'pagead2.googleadservices.com',
  'tpc.googlesyndication.com',
  'ade.googlesyndication.com',
  'static.doubleclick.net',
  'ad.doubleclick.net',
  'cm.g.doubleclick.net',
  'pubads.g.doubleclick.net',
  'securepubads.g.doubleclick.net',
  'stats.g.doubleclick.net',
  'ads.youtube.com',
  'ad.youtube.com',
  'youtube.cleverads.vn',
  '2mdn.net',
  's0.2mdn.net',
  'admeld.com',
  'innovid.com',
  's.innovid.com',
  'flashtalking.com',
  'moatads.com',
  'z.moatads.com',
  'fwmrm.net',
  'imasdk.googleapis.com',
  'fundingchoicesmessages.google.com',
  'wintricksbanner.googlepages.com',
];

export const BLOCKY_YOUTUBE_TELEMETRY_DENYLIST: readonly string[] = [
  's.youtube.com',
  'csi.gstatic.com',
  'google-analytics.com',
  'www.google-analytics.com',
  'ssl.google-analytics.com',
  'googletagmanager.com',
  'www.googletagmanager.com',
  'play.google.com',
];

export const BLOCKY_TRACKERS_DENYLIST: readonly string[] = [
  'scorecardresearch.com',
  'sb.scorecardresearch.com',
  'quantserve.com',
  'pixel.quantserve.com',
  'outbrain.com',
  'taboola.com',
  'criteo.com',
  'rubiconproject.com',
  'openx.net',
  'pubmatic.com',
  'adnxs.com',
];

/**
 * Core YouTube media domains that `0xERR0R/blocky` must NEVER block at the whole-domain level
 * so video playback, thumbnails, and authentication remain 100% functional.
 */
export const BLOCKY_YOUTUBE_CORE_ALLOWLIST: readonly string[] = [
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube.com',
  'www.youtube-nocookie.com',
  'youtube-nocookie.com',
  'youtu.be',
  'i.ytimg.com',
  's.ytimg.com',
  'yt3.ggpht.com',
  'accounts.google.com',
  'apis.google.com',
];

/**
 * Specific YouTube ad-delivery URL path & query patterns blocked even on core YouTube domains.
 */
export const YOUTUBE_AD_URL_PATTERNS: readonly RegExp[] = [
  /\/api\/stats\/ads\b/i,
  /\/api\/stats\/atr\b/i,
  /\/api\/stats\/qoe\b.*[?&]adformat=/i,
  /\/pagead\/(?!js\/adsbygoogle)/i,
  /\/ptracking\b/i,
  /\/get_midroll_info\b/i,
  /\/youtubei\/v1\/player\/ad_break\b/i,
  /\/youtubei\/v1\/log_event\b.*ad/i,
  /\/api\/activeview\b/i,
  /[?&](?:ad_type|adformat|ad_cpn|ad_tag|oad)=/i,
  /googlevideo\.com\/initplayback.*[?&]oad=/i,
];

export const DEFAULT_BLOCKY_CONFIG: BlockyConfig = {
  enabled: true,
  denylists: {
    ads: BLOCKY_ADS_DENYLIST,
    youtubeTelemetry: BLOCKY_YOUTUBE_TELEMETRY_DENYLIST,
    trackers: BLOCKY_TRACKERS_DENYLIST,
  },
  allowlists: {
    youtubeCore: BLOCKY_YOUTUBE_CORE_ALLOWLIST,
  },
  clientGroupsBlock: {
    default: ['ads', 'youtubeTelemetry', 'trackers'],
  },
};

export const DEFAULT_REMOVE_ADBLOCK_THING_CONFIG: RemoveAdblockThingConfig = {
  enabled: true,
  adblocker: true,
  removePopup: true,
  skipEmbeddedAdClips: true,
};

const STORAGE_KEY = 'lyricflow.youtubeAdBlocker.v1';

interface StoredAdBlockerPrefs {
  enabled?: boolean;
  blockyEnabled?: boolean;
  removeAdblockThingEnabled?: boolean;
  skipEmbeddedAdsEnabled?: boolean;
  blockedRequestsCount?: number;
  skippedAdsCount?: number;
  removedPopupsCount?: number;
}

const totalDefaultRules =
  BLOCKY_ADS_DENYLIST.length +
  BLOCKY_YOUTUBE_TELEMETRY_DENYLIST.length +
  BLOCKY_TRACKERS_DENYLIST.length +
  YOUTUBE_AD_URL_PATTERNS.length;

const dynamicBlockyHosts = new Set<string>([
  ...BLOCKY_ADS_DENYLIST,
  ...BLOCKY_YOUTUBE_TELEMETRY_DENYLIST,
  ...BLOCKY_TRACKERS_DENYLIST,
]);

function loadInitialAdBlockerState(): YouTubeAdBlockerState {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw) as StoredAdBlockerPrefs;
      return {
        enabled: parsed.enabled !== false,
        blockyEnabled: parsed.blockyEnabled !== false,
        removeAdblockThingEnabled: parsed.removeAdblockThingEnabled !== false,
        skipEmbeddedAdsEnabled: parsed.skipEmbeddedAdsEnabled !== false,
        blockedRequestsCount: Number(parsed.blockedRequestsCount) || 0,
        skippedAdsCount: Number(parsed.skippedAdsCount) || 0,
        removedPopupsCount: Number(parsed.removedPopupsCount) || 0,
        lastBlockedDomain: '',
        blockyRulesCount: dynamicBlockyHosts.size + YOUTUBE_AD_URL_PATTERNS.length,
      };
    }
  } catch {
    // Ignore storage read errors
  }
  return {
    enabled: true,
    blockyEnabled: true,
    removeAdblockThingEnabled: true,
    skipEmbeddedAdsEnabled: true,
    blockedRequestsCount: 0,
    skippedAdsCount: 0,
    removedPopupsCount: 0,
    lastBlockedDomain: '',
    blockyRulesCount: totalDefaultRules,
  };
}

let state: YouTubeAdBlockerState = loadInitialAdBlockerState();
const listeners = new Set<(next: YouTubeAdBlockerState) => void>();

function persistAndNotify(patch: Partial<YouTubeAdBlockerState>) {
  state = {
    ...state,
    ...patch,
    blockyRulesCount: dynamicBlockyHosts.size + YOUTUBE_AD_URL_PATTERNS.length,
  };
  try {
    if (typeof localStorage !== 'undefined') {
      const toStore: StoredAdBlockerPrefs = {
        enabled: state.enabled,
        blockyEnabled: state.blockyEnabled,
        removeAdblockThingEnabled: state.removeAdblockThingEnabled,
        skipEmbeddedAdsEnabled: state.skipEmbeddedAdsEnabled,
        blockedRequestsCount: state.blockedRequestsCount,
        skippedAdsCount: state.skippedAdsCount,
        removedPopupsCount: state.removedPopupsCount,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
    }
  } catch {
    // Ignore storage error
  }
  for (const listener of listeners) {
    listener(state);
  }
}

export function getYouTubeAdBlockerState(): YouTubeAdBlockerState {
  return state;
}

export function updateYouTubeAdBlockerConfig(
  patch: Partial<
    Pick<
      YouTubeAdBlockerState,
      'enabled' | 'blockyEnabled' | 'removeAdblockThingEnabled' | 'skipEmbeddedAdsEnabled'
    >
  >
): YouTubeAdBlockerState {
  persistAndNotify(patch);
  return state;
}

export function recordBlockedAdRequest(domainOrUrl: string): void {
  let host = domainOrUrl;
  try {
    host = new URL(domainOrUrl, 'https://www.youtube.com').hostname || domainOrUrl;
  } catch {
    // Keep raw label
  }
  persistAndNotify({
    blockedRequestsCount: state.blockedRequestsCount + 1,
    lastBlockedDomain: host,
  });
}

export function recordSkippedYouTubeAd(): void {
  persistAndNotify({
    skippedAdsCount: state.skippedAdsCount + 1,
  });
}

export function recordRemovedAntiAdblockPopup(): void {
  persistAndNotify({
    removedPopupsCount: state.removedPopupsCount + 1,
  });
}

/**
 * Evaluates a URL or hostname against the `0xERR0R/blocky` DNS denylists and YouTube ad path rules.
 * Returns `{ blocked: true, reason, host }` if the request should be sinkholed.
 */
export function evaluateBlockyUrl(rawUrl: string): {
  blocked: boolean;
  reason?: 'blocky-denylist' | 'youtube-ad-path';
  host?: string;
} {
  if (!state.enabled || !state.blockyEnabled || !rawUrl) {
    return { blocked: false };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl, typeof window !== 'undefined' ? window.location.origin : 'https://www.youtube.com');
  } catch {
    return { blocked: false };
  }

  const host = parsed.hostname.toLowerCase();
  if (!host) return { blocked: false };

  // 1. Check YouTube ad URL path / query patterns first (even on allowlisted YouTube hosts)
  const fullUrl = parsed.href;
  for (const pattern of YOUTUBE_AD_URL_PATTERNS) {
    if (pattern.test(fullUrl)) {
      return { blocked: true, reason: 'youtube-ad-path', host };
    }
  }

  // 2. Respect Blocky allowlist for core media playback hosts
  for (const allowed of BLOCKY_YOUTUBE_CORE_ALLOWLIST) {
    if (host === allowed) {
      return { blocked: false, host };
    }
  }
  if (host.endsWith('.googlevideo.com') || host.endsWith('.ytimg.com') || host.endsWith('.ggpht.com')) {
    return { blocked: false, host };
  }

  // 3. Match exact domain or parent domain in Blocky denylist
  const parts = host.split('.');
  for (let i = 0; i < parts.length - 1; i++) {
    const candidate = parts.slice(i).join('.');
    if (dynamicBlockyHosts.has(candidate)) {
      return { blocked: true, reason: 'blocky-denylist', host: candidate };
    }
  }

  return { blocked: false, host };
}

/**
 * Strips YouTube ad placements and anti-adblock enforcement payloads from a YouTube Innertube
 * player / search JSON object (`RemoveAdblockThing` JSON sanitizer).
 */
export function sanitizeYouTubePlayerJson<T>(payload: T): T {
  if (!state.enabled || !state.removeAdblockThingEnabled || !payload || typeof payload !== 'object') {
    return payload;
  }

  const AD_KEYS = new Set([
    'adPlacements',
    'playerAds',
    'adSlots',
    'adBreakHeartbeatParams',
    'adSafetyReason',
    'bkaEnforcementMessageViewModel',
    'enforcementMessageViewModel',
  ]);

  const seen = new WeakSet<object>();
  const cleanObject = (obj: unknown): unknown => {
    if (!obj || typeof obj !== 'object') return obj;
    if (seen.has(obj as object)) return obj;
    seen.add(obj as object);

    if (Array.isArray(obj)) {
      return obj.map(cleanObject);
    }

    const record = obj as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      if (AD_KEYS.has(key)) {
        delete record[key];
      } else if (record[key] && typeof record[key] === 'object') {
        cleanObject(record[key]);
      }
    }
    return record;
  };

  cleanObject(payload);
  return payload;
}

/**
 * Returns the standalone JavaScript payload implementing `TheRealJoelmatic/RemoveAdblockThing`
 * (`Youtube-Ad-blocker-Reminder-Remover.user.js`) + `0xERR0R/blocky` fetch/XHR filter.
 * Used both in the main window and injected into Android WebViews (`LocalBackendWebViewClient`).
 */
export function getRemoveAdblockThingScript(): string {
  return `
(function() {
  if (window.__lyricflowRemoveAdblockThingInstalled) return;
  window.__lyricflowRemoveAdblockThingInstalled = true;

  // 1. Spoof YouTube internal adblock detection flags (TheRealJoelmatic/RemoveAdblockThing)
  try {
    Object.defineProperty(window, '__ytplayer_adblockDetected', {
      configurable: true,
      get: function() { return false; },
      set: function() {}
    });
  } catch (e) {
    window.__ytplayer_adblockDetected = false;
  }

  const AD_SELECTORS = [
    'ytd-ad-slot-renderer',
    'ytd-in-feed-ad-layout-renderer',
    'ytd-banner-promo-renderer',
    'ytd-promoted-sparkles-web-renderer',
    'ytd-display-ad-renderer',
    'ytd-statement-banner-renderer',
    'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-ads"]',
    'ytm-promoted-sparkles-web-renderer',
    'ytm-companion-ad-renderer',
    '#masthead-ad',
    '#player-ads',
    '.ytp-featured-product',
    '.ytp-ad-overlay-container',
    '.ytp-ad-message-container'
  ];

  const SKIP_BUTTON_SELECTORS = [
    '.ytp-ad-skip-button',
    '.ytp-ad-skip-button-modern',
    '.ytp-skip-ad-button',
    '.ytp-ad-skip-button-slot button',
    '.ytp-ad-overlay-close-button'
  ];

  let wasPausedByPopup = false;

  // 2. RemoveAdblockThing: removePopup()
  function removeAntiAdblockPopup() {
    const enforcementSelectors = [
      'ytd-enforcement-message-view-model',
      'yt-playability-error-supported-renderers ytd-enforcement-message-view-model',
      'tp-yt-paper-dialog:has(ytd-enforcement-message-view-model)',
      'ytd-popup-container tp-yt-paper-dialog:has(#feedback.ytd-enforcement-message-view-model)'
    ];

    let removedAny = false;
    for (const sel of enforcementSelectors) {
      try {
        const nodes = document.querySelectorAll(sel);
        nodes.forEach(function(node) {
          const dialog = node.closest('tp-yt-paper-dialog') || node;
          dialog.remove();
          removedAny = true;
        });
      } catch (e) {}
    }

    const backdrops = document.querySelectorAll('tp-yt-iron-overlay-backdrop.opened, tp-yt-iron-overlay-backdrop');
    if (removedAny && backdrops.length > 0) {
      backdrops.forEach(function(b) { b.remove(); });
    }

    if (removedAny) {
      const video = document.querySelector('video.html5-main-video, video');
      if (video && video.paused) {
        video.play().catch(function() {});
      }
      wasPausedByPopup = true;
    } else if (wasPausedByPopup) {
      const video = document.querySelector('video.html5-main-video, video');
      if (video && video.paused && video.currentTime > 0 && !video.ended) {
        video.play().catch(function() {});
      }
      wasPausedByPopup = false;
    }
  }

  // 3. RemoveAdblockThing: adblocker()
  function skipAndRemoveVideoAds() {
    // Click any visible skip button immediately
    for (const sel of SKIP_BUTTON_SELECTORS) {
      const btns = document.querySelectorAll(sel);
      btns.forEach(function(btn) {
        if (btn && typeof btn.click === 'function') {
          btn.click();
        }
      });
    }

    // Detect if the player is currently showing an interruptive video ad
    const adPlayer = document.querySelector('.ad-showing, .ad-interrupting');
    if (adPlayer) {
      const video = adPlayer.querySelector('video.html5-main-video, video') || document.querySelector('video.html5-main-video');
      if (video) {
        video.muted = true;
        try {
          video.playbackRate = 16;
        } catch (e) {}
        if (Number.isFinite(video.duration) && video.duration > 0 && video.currentTime < video.duration - 0.1) {
          try {
            video.currentTime = video.duration;
          } catch (e) {}
        }
      }
      for (const sel of SKIP_BUTTON_SELECTORS) {
        const btn = document.querySelector(sel);
        if (btn && typeof btn.click === 'function') btn.click();
      }
    }

    // Remove static / companion ad slots
    for (const sel of AD_SELECTORS) {
      const els = document.querySelectorAll(sel);
      els.forEach(function(el) { el.remove(); });
    }
  }

  // 4. Strip adPlacements / playerAds from ytInitialPlayerResponse
  function scrubPlayerResponse(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    delete obj.adPlacements;
    delete obj.playerAds;
    delete obj.adSlots;
    delete obj.adBreakHeartbeatParams;
    if (obj.auxiliaryUi && obj.auxiliaryUi.messageRenderers) {
      delete obj.auxiliaryUi.messageRenderers.bkaEnforcementMessageViewModel;
    }
    return obj;
  }

  if (window.ytInitialPlayerResponse) {
    scrubPlayerResponse(window.ytInitialPlayerResponse);
  }

  setInterval(function() {
    try {
      removeAntiAdblockPopup();
      skipAndRemoveVideoAds();
    } catch (e) {}
  }, 400);
})();
`.trim();
}

let interceptorsInstalled = false;

/**
 * Installs client-side `0xERR0R/blocky` fetch/XHR interceptors and `RemoveAdblockThing` DOM/window guards.
 */
export function installYouTubeAdBlocker(): void {
  if (interceptorsInstalled || typeof window === 'undefined') return;
  interceptorsInstalled = true;

  // 1. Spoof YouTube adblock flag (`RemoveAdblockThing`)
  try {
    Object.defineProperty(window, '__ytplayer_adblockDetected', {
      configurable: true,
      get: () => false,
      set: () => {},
    });
  } catch {
    try {
      (window as unknown as Record<string, unknown>).__ytplayer_adblockDetected = false;
    } catch {
      // Ignore if window property is non-configurable
    }
  }

  // 2. Wrap window.fetch with `0xERR0R/blocky` domain & YouTube ad-path filter
  try {
    if (typeof window.fetch === 'function') {
      const originalFetch = window.fetch.bind(window);
      const wrappedFetch = async (
        input: RequestInfo | URL,
        init?: RequestInit
      ): Promise<Response> => {
        const urlStr =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.href
              : input?.url || '';
        const check = evaluateBlockyUrl(urlStr);
        if (check.blocked) {
          recordBlockedAdRequest(check.host || urlStr);
          return new Response(null, {
            status: 204,
            statusText: 'Blocked by LyricFlow Blocky AdBlocker',
            headers: { 'X-Blocky-Blocked': check.reason || 'denylist' },
          });
        }
        return originalFetch(input, init);
      };

      const desc = Object.getOwnPropertyDescriptor(window, 'fetch');
      if (!desc || desc.configurable) {
        Object.defineProperty(window, 'fetch', {
          configurable: true,
          enumerable: true,
          get: () => wrappedFetch,
          set: () => {},
        });
      } else if (desc.writable) {
        window.fetch = wrappedFetch;
      }
    }
  } catch {
    // Environment locks window.fetch (e.g. preview sandbox getter); native WebView & iframe hooks remain active
  }

  // 3. Wrap XMLHttpRequest.prototype.open with `0xERR0R/blocky` filter
  try {
    if (typeof XMLHttpRequest !== 'undefined' && XMLHttpRequest.prototype) {
      const origOpen = XMLHttpRequest.prototype.open;
      const origSend = XMLHttpRequest.prototype.send;
      const blockedXhrs = new WeakSet<XMLHttpRequest>();

      XMLHttpRequest.prototype.open = function (
        method: string,
        url: string | URL,
        async: boolean = true,
        username?: string | null,
        password?: string | null
      ) {
        const urlStr = typeof url === 'string' ? url : url?.href || '';
        const check = evaluateBlockyUrl(urlStr);
        if (check.blocked) {
          blockedXhrs.add(this);
          recordBlockedAdRequest(check.host || urlStr);
          return origOpen.call(this, method, 'data:text/plain,', async, username, password);
        }
        return origOpen.call(this, method, url, async, username, password);
      };

      XMLHttpRequest.prototype.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
        if (blockedXhrs.has(this)) {
          return;
        }
        return origSend.call(this, body);
      };
    }
  } catch {
    // Ignore if XMLHttpRequest prototype is frozen
  }
}

/**
 * Syncs the latest `0xERR0R/blocky` hosts count & rules from the backend (`/music/adblock/sync`).
 */
export async function syncBlockyListsFromBackend(): Promise<{
  rulesCount: number;
  syncedSources: string[];
}> {
  try {
    const base =
      (typeof localStorage !== 'undefined' && localStorage.getItem('lyricflow.resolver')) ||
      import.meta.env?.VITE_MUSIC_RESOLVER ||
      musicBackendBase();
    const res = await fetch(`${base.replace(/\/$/, '')}/adblock/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (res.ok) {
      const data = (await res.json()) as {
        hosts?: string[];
        rulesCount?: number;
        syncedSources?: string[];
      };
      if (Array.isArray(data.hosts)) {
        for (const h of data.hosts) {
          if (typeof h === 'string' && h.trim()) {
            dynamicBlockyHosts.add(h.trim().toLowerCase());
          }
        }
      }
      persistAndNotify({
        blockyRulesCount: Math.max(
          Number(data.rulesCount) || 0,
          dynamicBlockyHosts.size + YOUTUBE_AD_URL_PATTERNS.length
        ),
      });
      return {
        rulesCount: state.blockyRulesCount,
        syncedSources: data.syncedSources || ['StevenBlack/hosts', 'Disconnect.me/simple_ad'],
      };
    }
  } catch {
    // Non-fatal fallback to built-in Blocky lists
  }
  return {
    rulesCount: state.blockyRulesCount,
    syncedSources: ['Built-in Blocky Denylists (StevenBlack + Disconnect.me + YouTube Ad Rules)'],
  };
}

export function useYouTubeAdBlocker(): YouTubeAdBlockerState {
  const [current, setCurrent] = useState<YouTubeAdBlockerState>(() => getYouTubeAdBlockerState());
  useEffect(() => {
    installYouTubeAdBlocker();
    const listener = (next: YouTubeAdBlockerState) => setCurrent(next);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return current;
}
