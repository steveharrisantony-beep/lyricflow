package com.steveharrisantony.lyricflow;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/** Save a JSON backup through Android's document picker without storage permissions. */
@CapacitorPlugin(name = "DataTransfer")
public class DataTransferPlugin extends Plugin {
    private volatile boolean saving = false;

    @PluginMethod
    public void save(PluginCall call) {
        String filename = call.getString("filename", "");
        String data = call.getString("data");
        if (!filename.matches("lyricflow-[A-Za-z0-9._-]+\\.json") || data == null
                || data.getBytes(StandardCharsets.UTF_8).length > 10 * 1024 * 1024) {
            call.reject("Invalid backup file.");
            return;
        }
        if (saving) {
            call.reject("Another backup is already being saved.");
            return;
        }
        saving = true;
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/json");
        intent.putExtra(Intent.EXTRA_TITLE, filename);
        try {
            startActivityForResult(call, intent, "backupSaved");
        } catch (Exception error) {
            saving = false;
            call.reject("Could not open the Android Save dialog.", error);
        }
    }

    @ActivityCallback
    private void backupSaved(PluginCall call, ActivityResult result) {
        if (call == null) { saving = false; return; }
        if (result.getResultCode() != Activity.RESULT_OK) {
            saving = false;
            JSObject response = new JSObject();
            response.put("cancelled", true);
            call.resolve(response);
            return;
        }
        Uri uri = result.getData() == null ? null : result.getData().getData();
        String data = call.getString("data");
        if (uri == null || data == null) {
            saving = false;
            call.reject("No backup destination was selected.");
            return;
        }
        new Thread(() -> {
            try {
                try (OutputStream output = getContext().getContentResolver().openOutputStream(uri, "wt")) {
                    if (output == null) throw new java.io.IOException("No output stream");
                    output.write(data.getBytes(StandardCharsets.UTF_8));
                    output.flush();
                }
                JSObject response = new JSObject();
                response.put("cancelled", false);
                call.resolve(response);
            } catch (Exception error) {
                call.reject("Could not save the backup file.", error);
            } finally {
                saving = false;
            }
        }, "LyricFlowBackup").start();
    }
}
