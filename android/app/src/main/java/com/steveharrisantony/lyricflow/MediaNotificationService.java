package com.steveharrisantony.lyricflow;

import android.app.Notification;
import android.content.ComponentName;
import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.media.MediaMetadata;
import android.media.session.MediaController;
import android.media.session.MediaSession;
import android.media.session.MediaSessionManager;
import android.media.session.PlaybackState;
import android.os.Bundle;
import android.os.SystemClock;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import com.getcapacitor.JSObject;
import java.util.List;

public class MediaNotificationService extends NotificationListenerService {
    private static MediaNotificationService instance;
    private static volatile JSObject lastKnownMedia = null;

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
    }

    @Override
    public void onDestroy() {
        if (instance == this) {
            instance = null;
        }
        super.onDestroy();
    }

    @Override
    public void onListenerConnected() {
        super.onListenerConnected();
        instance = this;
        refreshFromActiveSessions(this);
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null) return;
        JSObject extracted = extractFromStatusBarNotification(this, sbn);
        if (extracted != null) {
            lastKnownMedia = extracted;
            ExternalMediaPlugin.notifyMediaChanged(extracted);
        } else {
            refreshFromActiveSessions(this);
        }
    }

    @Override
    public void onNotificationRemoved(StatusBarNotification sbn) {
        refreshFromActiveSessions(this);
    }

    public static JSObject getLastKnownMedia(Context context) {
        refreshFromActiveSessions(context);
        return lastKnownMedia;
    }

    public static void refreshFromActiveSessions(Context context) {
        if (context == null) return;
        String ownPackage = context.getPackageName();

        try {
            MediaSessionManager manager = (MediaSessionManager) context.getSystemService(Context.MEDIA_SESSION_SERVICE);
            if (manager != null) {
                ComponentName component = new ComponentName(context, MediaNotificationService.class);
                List<MediaController> controllers = manager.getActiveSessions(component);
                MediaController chosen = null;
                for (MediaController controller : controllers) {
                    if (controller == null) continue;
                    if (ownPackage.equals(controller.getPackageName())) continue;
                    PlaybackState state = controller.getPlaybackState();
                    if (state != null && (state.getState() == PlaybackState.STATE_PLAYING
                            || state.getState() == PlaybackState.STATE_BUFFERING)) {
                        chosen = controller;
                        break;
                    }
                    if (chosen == null && controller.getMetadata() != null) {
                        chosen = controller;
                    }
                }
                if (chosen != null) {
                    JSObject media = extractFromController(context, chosen);
                    if (media != null) {
                        lastKnownMedia = media;
                        ExternalMediaPlugin.notifyMediaChanged(media);
                        return;
                    }
                }
            }
        } catch (SecurityException ignored) {
            // Notification access not yet granted
        } catch (Throwable ignored) {
        }

        if (instance != null) {
            try {
                StatusBarNotification[] active = instance.getActiveNotifications();
                if (active != null) {
                    for (StatusBarNotification sbn : active) {
                        if (sbn == null || ownPackage.equals(sbn.getPackageName())) continue;
                        JSObject media = extractFromStatusBarNotification(context, sbn);
                        if (media != null) {
                            lastKnownMedia = media;
                            ExternalMediaPlugin.notifyMediaChanged(media);
                            return;
                        }
                    }
                }
            } catch (Throwable ignored) {
            }
        }
    }

    private static JSObject extractFromController(Context context, MediaController controller) {
        if (controller == null) return null;
        MediaMetadata meta = controller.getMetadata();
        if (meta == null) return null;

        String title = safeString(meta.getString(MediaMetadata.METADATA_KEY_TITLE));
        if (title.isEmpty()) {
            title = safeString(meta.getString(MediaMetadata.METADATA_KEY_DISPLAY_TITLE));
        }
        if (title.isEmpty()) return null;

        String artist = safeString(meta.getString(MediaMetadata.METADATA_KEY_ARTIST));
        if (artist.isEmpty()) {
            artist = safeString(meta.getString(MediaMetadata.METADATA_KEY_ALBUM_ARTIST));
        }
        if (artist.isEmpty()) {
            artist = safeString(meta.getString(MediaMetadata.METADATA_KEY_AUTHOR));
        }
        if (artist.isEmpty()) {
            artist = safeString(meta.getString(MediaMetadata.METADATA_KEY_DISPLAY_SUBTITLE));
        }

        String album = safeString(meta.getString(MediaMetadata.METADATA_KEY_ALBUM));
        long durationMs = meta.getLong(MediaMetadata.METADATA_KEY_DURATION);
        double durationSec = durationMs > 0 ? (durationMs / 1000.0) : 0.0;

        PlaybackState playbackState = controller.getPlaybackState();
        boolean playing = false;
        double positionSec = 0.0;
        if (playbackState != null) {
            int state = playbackState.getState();
            playing = (state == PlaybackState.STATE_PLAYING || state == PlaybackState.STATE_BUFFERING);
            long basePosMs = Math.max(0L, playbackState.getPosition());
            long updatedAt = playbackState.getLastPositionUpdateTime();
            float speed = playbackState.getPlaybackSpeed();
            if (playing && updatedAt > 0L) {
                long deltaMs = Math.max(0L, SystemClock.elapsedRealtime() - updatedAt);
                basePosMs += Math.round(deltaMs * (speed > 0f ? speed : 1.0f));
            }
            positionSec = basePosMs / 1000.0;
            if (durationSec > 0 && positionSec > durationSec) {
                positionSec = durationSec;
            }
        }

        String pkg = safeString(controller.getPackageName());
        String appName = resolveAppLabel(context, pkg);
        boolean isAd = isAdvertisementMetadata(pkg, appName, title, artist, album, durationSec);

        JSObject obj = new JSObject();
        obj.put("title", title);
        obj.put("artist", artist);
        obj.put("album", album);
        obj.put("duration", durationSec);
        obj.put("position", positionSec);
        obj.put("playing", playing);
        obj.put("packageName", pkg);
        obj.put("appName", appName);
        obj.put("isAd", isAd);
        obj.put("updatedAt", System.currentTimeMillis());
        return obj;
    }

    private static JSObject extractFromStatusBarNotification(Context context, StatusBarNotification sbn) {
        Notification notification = sbn.getNotification();
        if (notification == null || notification.extras == null) return null;
        String ownPackage = context.getPackageName();
        if (ownPackage.equals(sbn.getPackageName())) return null;

        Bundle extras = notification.extras;
        MediaSession.Token token = extras.getParcelable(Notification.EXTRA_MEDIA_SESSION);
        if (token != null) {
            try {
                MediaController controller = new MediaController(context, token);
                JSObject fromSession = extractFromController(context, controller);
                if (fromSession != null) return fromSession;
            } catch (Throwable ignored) {
            }
        }

        String category = safeString(notification.category);
        String template = safeString(extras.getString(Notification.EXTRA_TEMPLATE));
        boolean isMediaStyle = Notification.CATEGORY_TRANSPORT.equals(category)
                || template.contains("MediaStyle")
                || extras.containsKey(Notification.EXTRA_MEDIA_SESSION);
        if (!isMediaStyle) return null;

        CharSequence titleCs = extras.getCharSequence(Notification.EXTRA_TITLE);
        CharSequence textCs = extras.getCharSequence(Notification.EXTRA_TEXT);
        CharSequence subTextCs = extras.getCharSequence(Notification.EXTRA_SUB_TEXT);
        String title = titleCs != null ? titleCs.toString().trim() : "";
        if (title.isEmpty()) return null;
        String artist = textCs != null ? textCs.toString().trim() : "";
        String album = subTextCs != null ? subTextCs.toString().trim() : "";
        String pkg = safeString(sbn.getPackageName());
        String appName = resolveAppLabel(context, pkg);
        boolean isAd = isAdvertisementMetadata(pkg, appName, title, artist, album, 0.0);

        JSObject obj = new JSObject();
        obj.put("title", title);
        obj.put("artist", artist);
        obj.put("album", album);
        obj.put("duration", 0.0);
        obj.put("position", 0.0);
        obj.put("playing", true);
        obj.put("packageName", pkg);
        obj.put("appName", appName);
        obj.put("isAd", isAd);
        obj.put("updatedAt", System.currentTimeMillis());
        return obj;
    }

    private static boolean isAdvertisementMetadata(
            String pkg,
            String appName,
            String title,
            String artist,
            String album,
            double durationSec
    ) {
        String t = safeString(title).toLowerCase();
        String a = safeString(artist).toLowerCase();
        String alb = safeString(album).toLowerCase();
        String p = safeString(pkg).toLowerCase();
        String app = safeString(appName).toLowerCase();
        if (t.equals("advertisement") || t.equals("ad") || t.equals("sponsored")
                || t.equals("spotify") || t.equals("spotify free")
                || t.equals("audio ad") || t.equals("video ad")
                || t.startsWith("advertisement ·") || t.startsWith("advertisement -")
                || t.contains("sponsored message")) {
            return true;
        }
        if (a.equals("advertisement") || a.equals("sponsored") || a.equals("spotify ad")) {
            return true;
        }
        boolean isSpotify = p.contains("spotify") || app.contains("spotify");
        if (isSpotify) {
            if (a.equals("spotify") || alb.equals("advertisement")) return true;
            if (durationSec > 0.0 && durationSec <= 35.0 && a.isEmpty()) return true;
        }
        return false;
    }

    private static String resolveAppLabel(Context context, String packageName) {
        if (context == null || packageName == null || packageName.isEmpty()) return "External Player";
        try {
            PackageManager pm = context.getPackageManager();
            ApplicationInfo info = pm.getApplicationInfo(packageName, 0);
            CharSequence label = pm.getApplicationLabel(info);
            if (label != null && label.length() > 0) {
                return label.toString();
            }
        } catch (Throwable ignored) {
        }
        return packageName;
    }

    private static String safeString(String value) {
        return value == null ? "" : value.trim();
    }
}
