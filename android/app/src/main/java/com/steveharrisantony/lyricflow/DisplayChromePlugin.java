package com.steveharrisantony.lyricflow;

import android.app.Activity;
import android.os.Build;
import android.view.View;
import android.view.Window;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Keeps normal app content below the status bar and hides only status icons in cinema mode. */
@CapacitorPlugin(name = "DisplayChrome")
public class DisplayChromePlugin extends Plugin {
    @PluginMethod
    public void setCinemaMode(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Display is unavailable");
            return;
        }
        boolean cinema = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        activity.runOnUiThread(() -> {
            Window window = activity.getWindow();
            View decor = window.getDecorView();
            WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, decor);
            if (cinema) {
                controller.setSystemBarsBehavior(
                    WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                controller.hide(WindowInsetsCompat.Type.statusBars());
            } else {
                controller.show(WindowInsetsCompat.Type.statusBars());
            }
            // Android 15+ enforces edge-to-edge for this target SDK. CSS env()
            // alone is not reliably populated by all Android System WebViews.
            int top = 0;
            WindowInsetsCompat current = ViewCompat.getRootWindowInsets(decor);
            if (current != null) {
                top = current.getInsetsIgnoringVisibility(WindowInsetsCompat.Type.statusBars()).top;
            }
            if (top <= 0) {
                int statusBarId = activity.getResources().getIdentifier(
                    "status_bar_height", "dimen", "android");
                if (statusBarId > 0) top = activity.getResources().getDimensionPixelSize(statusBarId);
            }
            float density = activity.getResources().getDisplayMetrics().density;
            JSObject result = new JSObject();
            result.put("statusInsetCssPixels",
                Build.VERSION.SDK_INT >= 35 && density > 0 ? (int)Math.ceil(top / density) : 0);
            result.put("cinema", cinema);
            call.resolve(result);
        });
    }
}
