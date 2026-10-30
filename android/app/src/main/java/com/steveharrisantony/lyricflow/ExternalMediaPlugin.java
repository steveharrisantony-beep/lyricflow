package com.steveharrisantony.lyricflow;

import android.Manifest;
import android.app.Activity;
import android.app.Dialog;
import android.content.ComponentName;
import android.content.Intent;
import android.graphics.Color;
import android.media.audiofx.Visualizer;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.Gravity;
import android.view.ViewGroup;
import android.view.Window;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "ExternalMedia",
    permissions = {
        @Permission(
            strings = { Manifest.permission.RECORD_AUDIO },
            alias = "audio"
        )
    }
)
public class ExternalMediaPlugin extends Plugin {
    private static ExternalMediaPlugin activeInstance;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private Runnable pollRunnable;
    private Visualizer visualizer;

    @Override
    public void load() {
        super.load();
        activeInstance = this;
    }

    @Override
    protected void handleOnDestroy() {
        stopPollingInternal();
        stopVisualizerInternal();
        if (activeInstance == this) {
            activeInstance = null;
        }
        super.handleOnDestroy();
    }

    public static void notifyMediaChanged(JSObject media) {
        if (activeInstance != null && media != null) {
            activeInstance.notifyListeners("mediaChange", media, true);
        }
    }

    private boolean hasYouTubeLoginCookie(String cookie) {
        if (cookie == null || cookie.isEmpty()) return false;
        return cookie.contains("SAPISID=")
            || cookie.contains("__Secure-3PAPISID=")
            || cookie.contains("LOGIN_INFO=")
            || cookie.contains("SID=");
    }

    private String readMergedYouTubeCookies() {
        try {
            CookieManager cm = CookieManager.getInstance();
            String yt = cm.getCookie("https://www.youtube.com");
            String music = cm.getCookie("https://music.youtube.com");
            if (yt != null && !yt.isEmpty()) return yt;
            if (music != null && !music.isEmpty()) return music;
        } catch (Throwable ignored) {
        }
        return "";
    }

    @PluginMethod
    public void getYouTubeAuthStatus(PluginCall call) {
        String cookie = readMergedYouTubeCookies();
        JSObject ret = new JSObject();
        ret.put("signedIn", hasYouTubeLoginCookie(cookie));
        ret.put("cookie", cookie);
        call.resolve(ret);
    }

    @PluginMethod
    public void signOutYouTube(PluginCall call) {
        handler.post(() -> {
            try {
                CookieManager cm = CookieManager.getInstance();
                String[] cookies = new String[] {
                    "SAPISID=; Max-Age=0; Domain=.youtube.com; Path=/",
                    "__Secure-3PAPISID=; Max-Age=0; Domain=.youtube.com; Path=/; Secure",
                    "LOGIN_INFO=; Max-Age=0; Domain=.youtube.com; Path=/",
                    "SID=; Max-Age=0; Domain=.youtube.com; Path=/",
                    "HSID=; Max-Age=0; Domain=.youtube.com; Path=/",
                    "SSID=; Max-Age=0; Domain=.youtube.com; Path=/"
                };
                for (String c : cookies) {
                    cm.setCookie("https://www.youtube.com", c);
                }
                cm.flush();
            } catch (Throwable ignored) {
            }
            JSObject ret = new JSObject();
            ret.put("signedIn", false);
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void openYouTubeSignIn(final PluginCall call) {
        final Activity activity = getActivity();
        if (activity == null || activity.isFinishing()) {
            call.reject("Activity unavailable for YouTube sign-in.");
            return;
        }
        handler.post(() -> {
            try {
                final Dialog dialog = new Dialog(activity, android.R.style.Theme_Black_NoTitleBar_Fullscreen);
                dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);

                LinearLayout root = new LinearLayout(activity);
                root.setOrientation(LinearLayout.VERTICAL);
                root.setBackgroundColor(Color.parseColor("#080c16"));

                LinearLayout topBar = new LinearLayout(activity);
                topBar.setOrientation(LinearLayout.HORIZONTAL);
                topBar.setGravity(Gravity.CENTER_VERTICAL);
                topBar.setPadding(32, 24, 32, 24);
                topBar.setBackgroundColor(Color.parseColor("#111827"));

                TextView titleView = new TextView(activity);
                titleView.setText("Sign in to YouTube Account");
                titleView.setTextColor(Color.WHITE);
                titleView.setTextSize(16f);
                LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(
                    0,
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    1f
                );
                topBar.addView(titleView, titleParams);

                Button doneBtn = new Button(activity);
                doneBtn.setText("Done");
                doneBtn.setTextColor(Color.WHITE);
                doneBtn.setBackgroundColor(Color.parseColor("#2563eb"));
                topBar.addView(doneBtn);

                final WebView loginWebView = new WebView(activity);
                CookieManager cm = CookieManager.getInstance();
                cm.setAcceptCookie(true);
                cm.setAcceptThirdPartyCookies(loginWebView, true);

                WebSettings ws = loginWebView.getSettings();
                ws.setJavaScriptEnabled(true);
                ws.setDomStorageEnabled(true);
                ws.setDatabaseEnabled(true);
                ws.setUseWideViewPort(true);
                ws.setLoadWithOverviewMode(true);
                // Strip "; wv" from User-Agent so Google Sign-In allows standard browser login
                String defaultUa = ws.getUserAgentString();
                if (defaultUa != null) {
                    ws.setUserAgentString(defaultUa.replace("; wv", "").replace("Version/4.0 ", ""));
                }

                final boolean[] resolved = new boolean[] { false };
                final Runnable finishSignIn = () -> {
                    if (resolved[0]) return;
                    resolved[0] = true;
                    try {
                        CookieManager.getInstance().flush();
                    } catch (Throwable ignored) {
                    }
                    String cookie = readMergedYouTubeCookies();
                    try {
                        if (dialog.isShowing()) dialog.dismiss();
                        loginWebView.destroy();
                    } catch (Throwable ignored) {
                    }
                    JSObject ret = new JSObject();
                    ret.put("signedIn", hasYouTubeLoginCookie(cookie));
                    ret.put("cookie", cookie);
                    call.resolve(ret);
                };

                doneBtn.setOnClickListener(v -> finishSignIn.run());
                dialog.setOnCancelListener(d -> finishSignIn.run());

                loginWebView.setWebViewClient(new WebViewClient() {
                    @Override
                    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                        if (request != null && LocalBackendWebViewClient.isBlockedByBlocky(request.getUrl())) {
                            return LocalBackendWebViewClient.sinkholeResponse();
                        }
                        return super.shouldInterceptRequest(view, request);
                    }

                    @Override
                    public void onPageFinished(WebView view, String url) {
                        super.onPageFinished(view, url);
                        try {
                            CookieManager.getInstance().flush();
                            if (view != null) {
                                view.evaluateJavascript(LocalBackendWebViewClient.REMOVE_ADBLOCK_THING_JS, null);
                            }
                        } catch (Throwable ignored) {
                        }
                        String cookie = readMergedYouTubeCookies();
                        if (url != null
                            && (url.startsWith("https://www.youtube.com") || url.startsWith("https://m.youtube.com"))
                            && !url.contains("ServiceLogin")
                            && hasYouTubeLoginCookie(cookie)) {
                            finishSignIn.run();
                        }
                    }

                    @Override
                    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                        return false;
                    }
                });

                root.addView(topBar, new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                ));
                root.addView(loginWebView, new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    0,
                    1f
                ));

                dialog.setContentView(root);
                dialog.show();
                loginWebView.loadUrl(
                    "https://accounts.google.com/ServiceLogin?service=youtube&uilel=3&passive=true&continue=https%3A%2F%2Fwww.youtube.com%2F"
                );
            } catch (Throwable t) {
                call.reject("Failed to open YouTube sign-in dialog", new Exception(t));
            }
        });
    }

    private boolean hasNotificationListenerAccess() {
        if (getContext() == null) return false;
        String flat = Settings.Secure.getString(
            getContext().getContentResolver(),
            "enabled_notification_listeners"
        );
        if (flat == null || flat.isEmpty()) return false;
        ComponentName cn = new ComponentName(getContext(), MediaNotificationService.class);
        return flat.contains(cn.flattenToString()) || flat.contains(getContext().getPackageName());
    }

    @PluginMethod
    public void checkNotificationAccess(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", hasNotificationListenerAccess());
        call.resolve(ret);
    }

    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            JSObject ret = new JSObject();
            ret.put("opened", true);
            call.resolve(ret);
        } catch (Throwable t) {
            call.reject("Unable to open Android Notification Listener settings", new Exception(t));
        }
    }

    @PluginMethod
    public void getCurrentMedia(PluginCall call) {
        boolean granted = hasNotificationListenerAccess();
        JSObject media = granted ? MediaNotificationService.getLastKnownMedia(getContext()) : null;
        JSObject ret = new JSObject();
        ret.put("granted", granted);
        if (media != null) {
            ret.put("media", media);
        } else {
            ret.put("media", JSObject.NULL);
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void startListening(PluginCall call) {
        stopPollingInternal();
        pollRunnable = new Runnable() {
            @Override
            public void run() {
                if (hasNotificationListenerAccess()) {
                    MediaNotificationService.refreshFromActiveSessions(getContext());
                }
                handler.postDelayed(this, 350);
            }
        };
        handler.post(pollRunnable);
        JSObject ret = new JSObject();
        ret.put("listening", true);
        ret.put("granted", hasNotificationListenerAccess());
        JSObject current = hasNotificationListenerAccess()
            ? MediaNotificationService.getLastKnownMedia(getContext())
            : null;
        ret.put("media", current != null ? current : JSObject.NULL);
        call.resolve(ret);
    }

    @PluginMethod
    public void stopListening(PluginCall call) {
        stopPollingInternal();
        JSObject ret = new JSObject();
        ret.put("listening", false);
        call.resolve(ret);
    }

    @PluginMethod
    public void startAudioCapture(PluginCall call) {
        if (getPermissionState("audio") != PermissionState.GRANTED) {
            requestPermissionForAlias("audio", call, "audioPermissionCallback");
            return;
        }
        startCaptureWithPermission(call);
    }

    @PermissionCallback
    private void audioPermissionCallback(PluginCall call) {
        if (getPermissionState("audio") == PermissionState.GRANTED) {
            startCaptureWithPermission(call);
        } else {
            call.reject("Microphone / Audio permission is required for external player audio reactivity.");
        }
    }

    private void startCaptureWithPermission(PluginCall call) {
        String mode = call.getString("mode", "internal");
        stopVisualizerInternal();
        if ("internal".equalsIgnoreCase(mode)) {
            try {
                // Session 0 attaches to the Android global output mix for internal audio visualization
                visualizer = new Visualizer(0);
                int[] range = Visualizer.getCaptureSizeRange();
                int captureSize = range != null && range.length > 1 ? Math.min(1024, range[1]) : 512;
                visualizer.setCaptureSize(captureSize);
                final byte[] latestWave = new byte[captureSize];
                visualizer.setDataCaptureListener(
                    new Visualizer.OnDataCaptureListener() {
                        @Override
                        public void onWaveFormDataCapture(Visualizer vis, byte[] waveform, int samplingRate) {
                            if (waveform != null) {
                                System.arraycopy(waveform, 0, latestWave, 0, Math.min(waveform.length, latestWave.length));
                            }
                        }

                        @Override
                        public void onFftDataCapture(Visualizer vis, byte[] fft, int samplingRate) {
                            if (fft == null) return;
                            JSArray fftArr = new JSArray();
                            int bins = Math.min(128, fft.length / 2);
                            for (int i = 0; i < bins; i++) {
                                int r = fft[2 * i];
                                int im = fft[2 * i + 1];
                                int mag = (int) Math.min(255, Math.round(Math.hypot(r, im) * 1.8));
                               fftArr.put(mag);
                            }
                            JSArray waveArr = new JSArray();
                            int step = Math.max(1, latestWave.length / 128);
                            for (int i = 0; i < latestWave.length; i += step) {
                                waveArr.put(latestWave[i] & 0xFF);
                            }
                            JSObject payload = new JSObject();
                            payload.put("mode", "internal");
                            payload.put("fft", fftArr);
                            payload.put("waveform", waveArr);
                            notifyListeners("audioCapture", payload, false);
                        }
                    },
                    Visualizer.getMaxCaptureRate() / 2,
                    true,
                    true
                );
                visualizer.setEnabled(true);
                JSObject ret = new JSObject();
                ret.put("started", true);
                ret.put("mode", "internal");
                call.resolve(ret);
                return;
            } catch (Throwable t) {
                stopVisualizerInternal();
                call.reject("Internal audio capture unavailable on this device. Switch to Mic audio source.", new Exception(t));
                return;
            }
        }

        JSObject ret = new JSObject();
        ret.put("started", true);
        ret.put("mode", "mic");
        call.resolve(ret);
    }

    @PluginMethod
    public void stopAudioCapture(PluginCall call) {
        stopVisualizerInternal();
        JSObject ret = new JSObject();
        ret.put("stopped", true);
        call.resolve(ret);
    }

    private void stopPollingInternal() {
        if (pollRunnable != null) {
            handler.removeCallbacks(pollRunnable);
            pollRunnable = null;
        }
    }

    private void stopVisualizerInternal() {
        if (visualizer != null) {
            try {
                visualizer.setEnabled(false);
                visualizer.release();
            } catch (Throwable ignored) {
            }
            visualizer = null;
        }
    }
}

