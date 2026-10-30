package com.steveharrisantony.lyricflow;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/** User-initiated updates from this app's public GitHub Releases only. */
@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final AtomicBoolean downloading = new AtomicBoolean(false);
    private volatile String readyDigest;
    private volatile long readyVersion;
    private static final long MAX_APK_BYTES = 400L * 1024 * 1024;
    private static final String RELEASE_PATH = "/steveharrisantony-beep/lyricsflow-android/releases/download/";

    private File updateFile() {
        return new File(new File(getContext().getCacheDir(), "updates"), "LyricFlow-update.apk");
    }

    static boolean validReleaseUrl(String value) {
        try {
            URL url = new URL(value);
            return "https".equals(url.getProtocol()) && "github.com".equals(url.getHost())
                && url.getPort() == -1 && url.getUserInfo() == null && url.getQuery() == null
                && url.getRef() == null
                && url.getPath().matches(RELEASE_PATH + "android-[0-9]+/LyricFlow-Android\\.apk");
        } catch (Exception error) { return false; }
    }

    private static boolean allowedDownloadHost(URL url) {
        return "https".equals(url.getProtocol()) && url.getUserInfo() == null
            && (url.getPort() == -1 || url.getPort() == 443)
            && ("github.com".equals(url.getHost()) || "release-assets.githubusercontent.com".equals(url.getHost())
                || "objects.githubusercontent.com".equals(url.getHost()));
    }

    private static long version(PackageInfo info) {
        return Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode;
    }

    @SuppressWarnings("deprecation")
    private static Set<String> signers(PackageInfo info) {
        Signature[] values = Build.VERSION.SDK_INT >= 28 && info.signingInfo != null
            ? info.signingInfo.getApkContentsSigners() : info.signatures;
        Set<String> result = new HashSet<>();
        if (values != null) for (Signature signer : values) result.add(signer.toCharsString());
        return result;
    }

    @SuppressWarnings("deprecation")
    private void verifyApk(File file, String expectedDigest, long expectedVersion) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream input = new java.io.FileInputStream(file)) {
            byte[] buffer = new byte[65536];
            int count;
            while ((count = input.read(buffer)) != -1) digest.update(buffer, 0, count);
        }
        StringBuilder hex = new StringBuilder();
        for (byte value : digest.digest()) hex.append(String.format(java.util.Locale.US, "%02x", value & 255));
        if (!hex.toString().equalsIgnoreCase(expectedDigest)) throw new Exception("The download checksum did not match. Download the update again.");
        int flags = Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
        PackageManager manager = getContext().getPackageManager();
        PackageInfo archive = manager.getPackageArchiveInfo(file.getAbsolutePath(), flags);
        PackageInfo installed = manager.getPackageInfo(getContext().getPackageName(), flags);
        if (archive == null || !getContext().getPackageName().equals(archive.packageName))
            throw new Exception("This APK is not a LyricFlow update.");
        if (version(archive) != expectedVersion || version(archive) <= version(installed))
            throw new Exception("This APK is not newer than the installed version.");
        Set<String> installedSigners = signers(installed);
        if (installedSigners.isEmpty() || !installedSigners.equals(signers(archive)))
            throw new Exception("This update uses a different signing key. It cannot update this installation. Keep your app data and use a build signed with the same key.");
    }

    @PluginMethod
    public void getInfo(PluginCall call) {
        try {
            PackageInfo info = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            JSObject result = new JSObject();
            result.put("versionName", info.versionName);
            result.put("versionCode", version(info));
            call.resolve(result);
        } catch (Exception error) { call.reject("Could not read the app version.", error); }
    }

    @PluginMethod
    public void download(PluginCall call) {
        String address = call.getString("url", "");
        String sha256 = call.getString("sha256", "");
        Integer requestedVersion = call.getInt("versionCode");
        if (!validReleaseUrl(address) || !sha256.matches("(?i)[a-f0-9]{64}") || requestedVersion == null) {
            call.reject("The update address or checksum is invalid."); return;
        }
        if (!downloading.compareAndSet(false, true)) { call.reject("An update is already downloading."); return; }
        readyDigest = null;
        worker.execute(() -> {
            File target = updateFile();
            File partial = new File(target.getParentFile(), "update.part");
            HttpURLConnection connection = null;
            try {
                if (!target.getParentFile().isDirectory() && !target.getParentFile().mkdirs())
                    throw new Exception("Could not prepare update storage.");
                URL url = new URL(address);
                for (int redirect = 0; redirect < 6; redirect++) {
                    if (!allowedDownloadHost(url)) throw new Exception("The update redirected to an untrusted address.");
                    connection = (HttpURLConnection) url.openConnection();
                    connection.setConnectTimeout(20000);
                    connection.setReadTimeout(60000);
                    connection.setInstanceFollowRedirects(false);
                    connection.setRequestProperty("User-Agent", "LyricFlow-Updater");
                    int status = connection.getResponseCode();
                    if (status == 200) break;
                    if (status != 301 && status != 302 && status != 303 && status != 307 && status != 308)
                        throw new Exception("The update could not be downloaded (HTTP " + status + ").");
                    String location = connection.getHeaderField("Location");
                    if (location == null) throw new Exception("The update download address is missing.");
                    URL next = new URL(url, location);
                    connection.disconnect(); connection = null; url = next;
                }
                if (connection == null || connection.getResponseCode() != 200) throw new Exception("Too many download redirects.");
                long length = connection.getContentLengthLong();
                if (length > MAX_APK_BYTES) throw new Exception("The update exceeds the download size limit.");
                long total = 0, lastReport = 0;
                try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(partial)) {
                    byte[] buffer = new byte[65536]; int count;
                    while ((count = input.read(buffer)) != -1) {
                        if (Thread.currentThread().isInterrupted()) throw new Exception("Download cancelled.");
                        total += count;
                        if (total > MAX_APK_BYTES) throw new Exception("The update exceeds the download size limit.");
                        output.write(buffer, 0, count);
                        long now = android.os.SystemClock.elapsedRealtime();
                        if (now - lastReport > 300 && length > 0) {
                            JSObject progress = new JSObject();
                            progress.put("percent", (int)Math.min(99, total * 100 / length));
                            notifyListeners("updateProgress", progress); lastReport = now;
                        }
                    }
                }
                verifyApk(partial, sha256, requestedVersion);
                if (target.exists() && !target.delete()) throw new Exception("Could not replace the previous download.");
                if (!partial.renameTo(target)) throw new Exception("Could not save the update.");
                readyDigest = sha256; readyVersion = requestedVersion;
                JSObject result = new JSObject(); result.put("downloaded", true); call.resolve(result);
            } catch (Exception error) {
                partial.delete();
                call.reject(error.getMessage() == null ? "Update download failed." : error.getMessage(), error);
            } finally { if (connection != null) connection.disconnect(); downloading.set(false); }
        });
    }

    @PluginMethod
    public void install(PluginCall call) {
        if (readyDigest == null) { call.reject("Download and verify an update first."); return; }
        worker.execute(() -> {
            try {
                File file = updateFile();
                verifyApk(file, readyDigest, readyVersion);
                getActivity().runOnUiThread(() -> {
                    try {
                        JSObject result = new JSObject();
                        if (Build.VERSION.SDK_INT >= 26 && !getContext().getPackageManager().canRequestPackageInstalls()) {
                            Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
                            getActivity().startActivity(settings);
                            result.put("permissionRequired", true);
                        } else {
                            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
                            Intent installer = new Intent(Intent.ACTION_VIEW);
                            installer.setDataAndType(uri, "application/vnd.android.package-archive");
                            installer.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                            getActivity().startActivity(installer);
                            result.put("permissionRequired", false);
                        }
                        call.resolve(result);
                    } catch (Exception error) { call.reject("Could not open Android's update installer.", error); }
                });
            } catch (Exception error) { call.reject(error.getMessage(), error); }
        });
    }

    @Override
    protected void handleOnDestroy() {
        worker.shutdownNow();
        super.handleOnDestroy();
    }
}
