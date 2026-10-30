package com.steveharrisantony.lyricflow;

import android.net.Uri;
import android.text.TextUtils;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;
import java.io.ByteArrayInputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Same-origin API and streaming proxy + native 0xERR0R/blocky ad-domain sinkhole
 * and TheRealJoelmatic/RemoveAdblockThing YouTube ad skipper & anti-adblock popup remover.
 */
final class LocalBackendWebViewClient extends BridgeWebViewClient {
    private static final Set<String> BLOCKY_DENYLIST_DOMAINS = new HashSet<>(Arrays.asList(
        "doubleclick.net",
        "googlesyndication.com",
        "googleadservices.com",
        "adservice.google.com",
        "adservice.google.co.in",
        "adservice.google.co.uk",
        "pagead2.googlesyndication.com",
        "pagead2.googleadservices.com",
        "tpc.googlesyndication.com",
        "ade.googlesyndication.com",
        "static.doubleclick.net",
        "ad.doubleclick.net",
        "cm.g.doubleclick.net",
        "pubads.g.doubleclick.net",
        "securepubads.g.doubleclick.net",
        "stats.g.doubleclick.net",
        "ads.youtube.com",
        "ad.youtube.com",
        "s.youtube.com",
        "youtube.cleverads.vn",
        "2mdn.net",
        "s0.2mdn.net",
        "admeld.com",
        "innovid.com",
        "s.innovid.com",
        "flashtalking.com",
        "moatads.com",
        "z.moatads.com",
        "fwmrm.net",
        "imasdk.googleapis.com",
        "fundingchoicesmessages.google.com",
        "google-analytics.com",
        "www.google-analytics.com",
        "ssl.google-analytics.com",
        "googletagmanager.com",
        "www.googletagmanager.com",
        "scorecardresearch.com",
        "sb.scorecardresearch.com",
        "quantserve.com"
    ));

    static final String REMOVE_ADBLOCK_THING_JS =
        "(function(){" +
        "if(window.__lyricflowRemoveAdblockThingInstalled)return;" +
        "window.__lyricflowRemoveAdblockThingInstalled=true;" +
        "try{Object.defineProperty(window,'__ytplayer_adblockDetected',{configurable:true,get:function(){return false;},set:function(){}});}catch(e){window.__ytplayer_adblockDetected=false;}" +
        "var skipSels=['.ytp-ad-skip-button','.ytp-ad-skip-button-modern','.ytp-skip-ad-button','.ytp-ad-skip-button-slot button','.ytp-ad-overlay-close-button'];" +
        "var adSels=['ytd-ad-slot-renderer','ytd-in-feed-ad-layout-renderer','ytd-banner-promo-renderer','ytd-promoted-sparkles-web-renderer','ytd-display-ad-renderer','#masthead-ad','#player-ads','.ytp-featured-product','.ytp-ad-overlay-container'];" +
        "var popupSels=['ytd-enforcement-message-view-model','tp-yt-paper-dialog:has(ytd-enforcement-message-view-model)'];" +
        "setInterval(function(){try{" +
        "for(var i=0;i<popupSels.length;i++){var ps=document.querySelectorAll(popupSels[i]);for(var j=0;j<ps.length;j++){ps[j].remove();var v=document.querySelector('video');if(v&&v.paused)v.play().catch(function(){});}}" +
        "for(var k=0;k<skipSels.length;k++){var bs=document.querySelectorAll(skipSels[k]);for(var m=0;m<bs.length;m++){if(bs[m]&&bs[m].click)bs[m].click();}}" +
        "var adP=document.querySelector('.ad-showing,.ad-interrupting');if(adP){var vid=adP.querySelector('video')||document.querySelector('video.html5-main-video');if(vid){vid.muted=true;try{vid.playbackRate=16;}catch(e){}if(isFinite(vid.duration)&&vid.duration>0&&vid.currentTime<vid.duration-0.1){try{vid.currentTime=vid.duration;}catch(e){}}}}" +
        "for(var n=0;n<adSels.length;n++){var as=document.querySelectorAll(adSels[n]);for(var p=0;p<as.length;p++)as[p].remove();}" +
        "}catch(e){}},400);" +
        "})();";

    private final String appHost;
    private final String appOrigin;

    LocalBackendWebViewClient(Bridge bridge) {
        super(bridge);
        appHost = bridge.getHost();
        appOrigin = bridge.getScheme() + "://" + appHost;
    }

    static boolean isBlockedByBlocky(Uri uri) {
        if (uri == null) return false;
        String host = uri.getHost();
        if (host == null || host.isEmpty()) return false;
        String lowerHost = host.toLowerCase(Locale.US);

        String path = uri.getEncodedPath() != null ? uri.getEncodedPath().toLowerCase(Locale.US) : "";
        String query = uri.getEncodedQuery() != null ? uri.getEncodedQuery().toLowerCase(Locale.US) : "";

        // 1. Block YouTube ad-serving paths & query parameters even on youtube.com / googlevideo.com
        if (lowerHost.endsWith("youtube.com") || lowerHost.endsWith("youtube-nocookie.com")) {
            if (path.startsWith("/api/stats/ads")
                || path.startsWith("/api/stats/atr")
                || path.startsWith("/pagead/")
                || path.startsWith("/ptracking")
                || path.startsWith("/get_midroll_info")
                || path.startsWith("/youtubei/v1/player/ad_break")
                || path.startsWith("/api/activeview")
                || (path.startsWith("/api/stats/qoe") && query.contains("adformat="))
                || query.contains("ad_type=")
                || query.contains("adformat=")
                || query.contains("ad_cpn=")
                || query.contains("oad=")) {
                return true;
            }
            return false;
        }

        if (lowerHost.endsWith(".googlevideo.com")) {
            if ((path.contains("/videoplayback") && query.contains("ctier=l"))
                || (path.contains("/initplayback") && query.contains("oad="))) {
                return true;
            }
            return false;
        }

        // 2. Check domain and parent domains against 0xERR0R/blocky denylists
        String[] parts = lowerHost.split("\\.");
        for (int i = 0; i < parts.length - 1; i++) {
            StringBuilder sb = new StringBuilder();
            for (int j = i; j < parts.length; j++) {
                if (j > i) sb.append('.');
                sb.append(parts[j]);
            }
            if (BLOCKY_DENYLIST_DOMAINS.contains(sb.toString())) {
                return true;
            }
        }
        return false;
    }

    static WebResourceResponse sinkholeResponse() {
        Map<String, String> headers = new HashMap<>();
        headers.put("Cache-Control", "no-store");
        headers.put("Access-Control-Allow-Origin", "*");
        headers.put("X-Blocky-Action", "blocked");
        return new WebResourceResponse(
            "text/plain",
            "UTF-8",
            204,
            "No Content",
            headers,
            new ByteArrayInputStream(new byte[0])
        );
    }

    private static String header(Map<String, String> headers, String name) {
        for (Map.Entry<String, String> entry : headers.entrySet()) {
            if (name.equalsIgnoreCase(entry.getKey())) return entry.getValue();
        }
        return null;
    }

    private static WebResourceResponse error(int status, String message) {
        byte[] data = ("{\"detail\":\"" + message + "\"}").getBytes(StandardCharsets.UTF_8);
        Map<String, String> headers = new HashMap<>();
        headers.put("Cache-Control", "no-store");
        return new WebResourceResponse("application/json", "UTF-8", status, "Service unavailable",
            headers, new ByteArrayInputStream(data));
    }

    @Override
    public void onPageFinished(WebView view, String url) {
        super.onPageFinished(view, url);
        if (view != null) {
            try {
                view.evaluateJavascript(REMOVE_ADBLOCK_THING_JS, null);
            } catch (Throwable ignored) {
            }
        }
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        Uri uri = request.getUrl();
        if (isBlockedByBlocky(uri)) {
            return sinkholeResponse();
        }
        String path = uri.getEncodedPath();
        if (!appHost.equals(uri.getAuthority()) || !appOrigin.startsWith(uri.getScheme() + "://") ||
            path == null || !path.startsWith("/music/")) {
            return super.shouldInterceptRequest(view, request);
        }
        String origin = header(request.getRequestHeaders(), "Origin");
        String fetchSite = header(request.getRequestHeaders(), "Sec-Fetch-Site");
        if ((origin != null && !appOrigin.equals(origin)) || "cross-site".equals(fetchSite)) {
            return error(403, "Cross-origin local service requests are not allowed.");
        }
        String method = request.getMethod();
        if (!"GET".equals(method) && !"HEAD".equals(method)) {
            return error(405, "Unsupported local service method.");
        }
        int port = LocalBackendPlugin.getPort();
        if (port == 0) return error(503, "The on-device music service is not ready.");

        HttpURLConnection connection = null;
        try {
            String query = uri.getEncodedQuery();
            URL url = new URL("http", "127.0.0.1", port, path + (query == null ? "" : "?" + query));
            connection = (HttpURLConnection) url.openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(5000);
            connection.setReadTimeout(60000);
            connection.setRequestMethod(method);
            connection.setRequestProperty("X-LyricFlow-Token", LocalBackendPlugin.getToken());
            connection.setRequestProperty("Accept-Encoding", "identity");
            for (String name : new String[]{"Range", "Accept", "X-YouTube-Token", "X-YouTube-Cookie"}) {
                String value = header(request.getRequestHeaders(), name);
                if (value != null) connection.setRequestProperty(name, value);
            }
            int status = connection.getResponseCode();
            if (status >= 300 && status < 400) {
                connection.disconnect();
                return error(502, "Unexpected local service redirect.");
            }
            Map<String, String> headers = new HashMap<>();
            for (Map.Entry<String, List<String>> entry : connection.getHeaderFields().entrySet()) {
                if (entry.getKey() != null && entry.getValue() != null &&
                    !"Transfer-Encoding".equalsIgnoreCase(entry.getKey()) &&
                    !"Connection".equalsIgnoreCase(entry.getKey())) {
                    headers.put(entry.getKey(), TextUtils.join(", ", entry.getValue()));
                }
            }
            String contentType = connection.getContentType();
            String mime = contentType == null ? "application/octet-stream" : contentType.split(";")[0].trim();
            InputStream input = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            if (input == null) input = new ByteArrayInputStream(new byte[0]);
            final HttpURLConnection active = connection;
            InputStream stream = new FilterInputStream(input) {
                @Override public void close() throws IOException {
                    try { super.close(); } finally { active.disconnect(); }
                }
            };
            String reason = connection.getResponseMessage();
            if (reason == null || reason.trim().isEmpty()) reason = "OK";
            return new WebResourceResponse(mime, mime.startsWith("text/") || mime.contains("json") ? "UTF-8" : null,
                status, reason, headers, stream);
        } catch (IOException | IllegalArgumentException exception) {
            if (connection != null) connection.disconnect();
            return error(503, "The on-device music service is unavailable. Restart LyricFlow to retry.");
        }
    }
}

