package com.steveharrisantony.lyricflow;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.WebSettings;
import android.webkit.WebView;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LocalBackendPlugin.class);
        registerPlugin(ExternalMediaPlugin.class);
        super.onCreate(savedInstanceState);
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
        }
    }
}


