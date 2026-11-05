package com.steveharrisantony.lyricflow;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import android.content.pm.ActivityInfo;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.WebSettings;
import android.webkit.WebView;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LocalBackendPlugin.class);
        registerPlugin(ExternalMediaPlugin.class);
        registerPlugin(AppUpdaterPlugin.class);
        registerPlugin(MediaPlaybackPolicyPlugin.class);
        registerPlugin(DataTransferPlugin.class);
        registerPlugin(TvDevicePlugin.class);
        registerPlugin(PlaybackAwakePlugin.class);
        registerPlugin(DisplayChromePlugin.class);
        registerPlugin(GoogleSignInPlugin.class);
        super.onCreate(savedInstanceState);
        boolean tv = getPackageManager().hasSystemFeature("android.software.leanback")
                || getPackageManager().hasSystemFeature("android.hardware.type.television");
        if (tv) setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        if (this.bridge != null && this.bridge.getWebView() != null) {
            WebView webView = this.bridge.getWebView();
            cookieManager.setAcceptThirdPartyCookies(webView, true);
            WebSettings settings = webView.getSettings();
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            settings.setMediaPlaybackRequiresUserGesture(false);
            webView.setFocusable(true);
            webView.setFocusableInTouchMode(true);
            if (tv) webView.requestFocus();
        }
    }

    @Override
    public void onBackPressed() {
        boolean isTv = getPackageManager().hasSystemFeature("android.software.leanback")
                || getPackageManager().hasSystemFeature("android.hardware.type.television");
        WebView webView = this.bridge == null ? null : this.bridge.getWebView();
        if (!isTv || webView == null) {
            super.onBackPressed();
            return;
        }
        // Let TV remotes close the topmost overlay; otherwise use normal Android Back.
        webView.evaluateJavascript(
            "(function(){var e=new Event('lyricflow:tv-back',{cancelable:true});return window.dispatchEvent(e);})()",
            result -> {
                if (!"false".equals(result)) MainActivity.super.onBackPressed();
            });
    }
}
