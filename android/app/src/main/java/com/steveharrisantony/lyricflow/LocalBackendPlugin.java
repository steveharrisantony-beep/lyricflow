package com.steveharrisantony.lyricflow;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.security.SecureRandom;

@CapacitorPlugin(name = "LocalBackend")
public class LocalBackendPlugin extends Plugin {
    private static final String TOKEN = createToken();
    private static volatile int port;

    private static String createToken() {
        byte[] bytes = new byte[32];
        new SecureRandom().nextBytes(bytes);
        StringBuilder token = new StringBuilder();
        for (byte value : bytes) token.append(String.format("%02x", value & 0xff));
        return token.toString();
    }

    static int getPort() { return port; }
    static String getToken() { return TOKEN; }

    @Override
    public void load() {
        getBridge().setWebViewClient(new LocalBackendWebViewClient(getBridge()));
    }

    @PluginMethod
    public void prepare(PluginCall call) {
        JSObject result = new JSObject();
        result.put("token", TOKEN);
        result.put("port", port);
        call.resolve(result);
    }

    @PluginMethod
    public void attach(PluginCall call) {
        Integer value = call.getInt("port");
        if (value == null || value < 1 || value > 65535) {
            call.reject("Invalid local service port.");
            return;
        }
        port = value;
        call.resolve();
    }
}
