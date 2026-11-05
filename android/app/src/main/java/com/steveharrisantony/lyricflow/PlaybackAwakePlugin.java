package com.steveharrisantony.lyricflow;

import android.app.Activity;
import android.view.WindowManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Prevents display sleep only during active playback while LyricFlow is visible. */
@CapacitorPlugin(name = "PlaybackAwake")
public class PlaybackAwakePlugin extends Plugin {
    @PluginMethod
    public void setPlaying(PluginCall call) {
        final boolean playing = Boolean.TRUE.equals(call.getBoolean("playing", false));
        final Activity activity = getActivity();
        if (activity == null) {
            call.reject("Playback activity is unavailable");
            return;
        }
        activity.runOnUiThread(() -> {
            if (playing) {
                activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            } else {
                activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            }
            JSObject result = new JSObject();
            result.put("active", playing);
            call.resolve(result);
        });
    }
}
