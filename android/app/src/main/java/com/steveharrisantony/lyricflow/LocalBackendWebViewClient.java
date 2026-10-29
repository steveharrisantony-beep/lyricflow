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
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Same-origin API and streaming proxy; only native code sees the private token. */
final class LocalBackendWebViewClient extends BridgeWebViewClient {
    private final String appHost;
    private final String appOrigin;

    LocalBackendWebViewClient(Bridge bridge) {
        super(bridge);
        appHost = bridge.getHost();
        appOrigin = bridge.getScheme() + "://" + appHost;
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
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        Uri uri = request.getUrl();
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
            for (String name : new String[]{"Range", "Accept"}) {
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
