package com.steveharrisantony.lyricflow;

import android.content.pm.PackageManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Hardware capabilities for a single APK that also runs on phones and tablets. */
@CapacitorPlugin(name = "TvDevice")
public class TvDevicePlugin extends Plugin {
    @PluginMethod
    public void getCapabilities(PluginCall call) {
        PackageManager pm = getContext().getPackageManager();
        boolean isTv = pm.hasSystemFeature("android.software.leanback")
                || pm.hasSystemFeature("android.hardware.type.television");
        JSObject result = new JSObject();
        result.put("isTelevision", isTv);
        result.put("hasMicrophone", pm.hasSystemFeature(PackageManager.FEATURE_MICROPHONE));
        result.put("hasTouchscreen", pm.hasSystemFeature(PackageManager.FEATURE_TOUCHSCREEN));
        call.resolve(result);
    }
}
