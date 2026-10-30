package com.steveharrisantony.lyricflow;

import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** External-player mode has no audible WebView media and must not take Android audio focus. */
@CapacitorPlugin(name = "MediaPlaybackPolicy")
public class MediaPlaybackPolicyPlugin extends Plugin {
    @PluginMethod
    public void configure(PluginCall call) {
        boolean external = Boolean.TRUE.equals(call.getBoolean("externalPlayer", false));
        getActivity().runOnUiThread(() -> {
            try {
                boolean supported = WebViewFeature.isFeatureSupported(WebViewFeature.MUTE_AUDIO);
                if (supported) WebViewCompat.setAudioMuted(getBridge().getWebView(), external);
                JSObject result = new JSObject();
                result.put("safeBackground", !external || supported);
                call.resolve(result);
            } catch (Exception error) {
                call.reject("Could not configure external-player audio focus.", error);
            }
        });
    }
}
