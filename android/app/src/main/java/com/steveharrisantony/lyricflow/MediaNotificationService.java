package com.steveharrisantony.lyricflow;

import android.app.Notification;
import android.content.ComponentName;
import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.Drawable;
import android.media.MediaMetadata;
import android.media.session.MediaController;
import android.media.session.MediaSession;
import android.media.session.MediaSessionManager;
import android.media.session.PlaybackState;
import android.os.Bundle;
import android.os.SystemClock;
import android.os.Handler;
import android.os.Looper;
import android.net.Uri;
import android.media.VolumeProvider;
import android.support.v4.media.session.MediaControllerCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import com.getcapacitor.JSObject;
import java.util.List;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import android.util.Base64;
import java.util.Locale;

public class MediaNotificationService extends NotificationListenerService {
    private static MediaNotificationService instance;
    private static volatile JSObject lastKnownMedia = null;
    private static final String ADVERTISEMENT = "android.media.metadata.ADVERTISEMENT";
    private static MediaController selectedController;
    private static MediaControllerCompat selectedCompatibleController;
    private static String artworkKey = "";
    private static String cachedArtwork = "";
    private static final Handler mainHandler = new Handler(Looper.getMainLooper());
    private static final MediaController.Callback mediaCallback = new MediaController.Callback() {
        @Override public void onMetadataChanged(MediaMetadata metadata) {
            artworkKey = "";
            if (instance != null) refreshFromActiveSessions(instance);
        }
        @Override public void onPlaybackStateChanged(PlaybackState state) {
            if (instance != null) refreshFromActiveSessions(instance);
        }
        @Override public void onSessionDestroyed() {
            if (instance != null) refreshFromActiveSessions(instance);
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
    }

    @Override
    public void onDestroy() {
        if (instance == this) {
            selectController(null);
            lastKnownMedia = null;
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
        refreshFromActiveSessions(this);
    }

    @Override
    public void onNotificationRemoved(StatusBarNotification sbn) {
        refreshFromActiveSessions(this);
    }

    public static synchronized JSObject getLastKnownMedia(Context context) {
        refreshFromActiveSessions(context);
        return lastKnownMedia;
    }

    public static synchronized void refreshFromActiveSessions(Context context) {
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
        selectController(null);
        if (lastKnownMedia != null) {
            lastKnownMedia = null;
            ExternalMediaPlugin.notifyMediaChanged(new JSObject());
        }
    }

    private static void selectController(MediaController controller) {
        if (selectedController == null && controller == null) return;
        if (selectedController != null && controller != null
            && selectedController.getSessionToken().equals(controller.getSessionToken())) return;
        if (selectedController != null) selectedController.unregisterCallback(mediaCallback);
        selectedController = controller;
        selectedCompatibleController = null;
        artworkKey = "";
        cachedArtwork = "";
        if (controller != null) controller.registerCallback(mediaCallback, mainHandler);
    }

    private static String sessionId(MediaController controller) {
        return controller.getPackageName() + ":" + controller.getSessionToken().hashCode();
    }

    private static MediaControllerCompat compatibleController(Context context, MediaController controller) {
        if (selectedCompatibleController == null) {
            selectedCompatibleController = new MediaControllerCompat(context, MediaSessionCompat.Token.fromToken(controller.getSessionToken()));
        }
        return selectedCompatibleController;
    }

    private static JSObject controlsFor(MediaController controller) {
        PlaybackState state = controller.getPlaybackState();
        long actions = state == null ? 0 : state.getActions();
        JSObject controls = new JSObject();
        controls.put("play", (actions & (PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PLAY_PAUSE)) != 0);
        controls.put("pause", (actions & (PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE)) != 0);
        controls.put("previous", (actions & PlaybackState.ACTION_SKIP_TO_PREVIOUS) != 0);
        controls.put("next", (actions & PlaybackState.ACTION_SKIP_TO_NEXT) != 0);
        controls.put("seek", (actions & PlaybackState.ACTION_SEEK_TO) != 0);
        controls.put("shuffle", (actions & PlaybackStateCompat.ACTION_SET_SHUFFLE_MODE) != 0);
        controls.put("repeat", (actions & PlaybackStateCompat.ACTION_SET_REPEAT_MODE) != 0);
        MediaController.PlaybackInfo info = controller.getPlaybackInfo();
        controls.put("volume", info != null && info.getVolumeControl() == VolumeProvider.VOLUME_CONTROL_ABSOLUTE);
        return controls;
    }

    public static synchronized void control(Context context, String targetSessionId, String command, Double value) {
        refreshFromActiveSessions(context);
        MediaController controller = selectedController;
        if (controller == null || !sessionId(controller).equals(targetSessionId)) {
            throw new IllegalStateException("The external player changed. Please try again.");
        }
        if (!controlsFor(controller).optBoolean(command, false)) {
            throw new IllegalArgumentException("This control is unavailable in the external player.");
        }
        MediaController.TransportControls transport = controller.getTransportControls();
        switch (command) {
            case "play": transport.play(); break;
            case "pause": transport.pause(); break;
            case "previous": transport.skipToPrevious(); break;
            case "next": transport.skipToNext(); break;
            case "seek":
                requireValue(value);
                long position = Math.max(0L, Math.round(value * 1000));
                MediaMetadata metadata = controller.getMetadata();
                long duration = metadata == null ? 0 : metadata.getLong(MediaMetadata.METADATA_KEY_DURATION);
                transport.seekTo(duration > 0 ? Math.min(duration, position) : position);
                break;
            case "volume":
                requireValue(value);
                int maxVolume = controller.getPlaybackInfo().getMaxVolume();
                controller.setVolumeTo((int) Math.round(Math.max(0, Math.min(100, value)) * maxVolume / 100), 0);
                break;
            case "shuffle":
                requireValue(value);
                compatibleController(context, controller).getTransportControls().setShuffleMode(
                    value > 0 ? PlaybackStateCompat.SHUFFLE_MODE_ALL : PlaybackStateCompat.SHUFFLE_MODE_NONE);
                break;
            case "repeat":
                requireValue(value);
                compatibleController(context, controller).getTransportControls().setRepeatMode(
                    value > 0 ? PlaybackStateCompat.REPEAT_MODE_ONE : PlaybackStateCompat.REPEAT_MODE_NONE);
                break;
            default: throw new IllegalArgumentException("Unknown external player control.");
        }
    }

    private static void requireValue(Double value) {
        if (value == null || value.isNaN() || value.isInfinite()) {
            throw new IllegalArgumentException("Invalid external player control value.");
        }
    }

    private static JSObject extractFromController(Context context, MediaController controller) {
        if (controller == null) return null;
        MediaMetadata meta = controller.getMetadata();
        if (meta == null) return null;

        String pkg = safeString(controller.getPackageName());
        String appName = resolveAppLabel(context, pkg);
        StatusBarNotification notification = notificationFor(controller);
        Bundle notificationExtras = notification == null ? null : notification.getNotification().extras;
        PlaybackState playbackState = controller.getPlaybackState();
        boolean advertised = meta.getLong(ADVERTISEMENT) != 0 || hasAdvertisementFlag(controller.getExtras())
            || isAdvertisementNotification(notificationExtras)
            || (playbackState != null && hasAdvertisementFlag(playbackState.getExtras()));

        String title = safeString(meta.getString(MediaMetadata.METADATA_KEY_TITLE));
        if (title.isEmpty()) {
            title = safeString(meta.getString(MediaMetadata.METADATA_KEY_DISPLAY_TITLE));
        }
        if (title.isEmpty() && advertised) title = "Advertisement";
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

        boolean isAd = advertised || isAdvertisementMetadata(title, artist, album);
        selectController(controller);
        String artwork = readArtwork(context, meta, notification, pkg + "|" + title + "|" + artist + "|" + album);

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
        obj.put("artwork", artwork);
        obj.put("sessionId", sessionId(controller));
        obj.put("controls", controlsFor(controller));
        MediaControllerCompat compatible = compatibleController(context, controller);
        obj.put("shuffleEnabled", compatible.getShuffleMode() > PlaybackStateCompat.SHUFFLE_MODE_NONE);
        obj.put("repeatEnabled", compatible.getRepeatMode() > PlaybackStateCompat.REPEAT_MODE_NONE);
        MediaController.PlaybackInfo info = controller.getPlaybackInfo();
        if (info != null && info.getMaxVolume() > 0) {
            obj.put("volume", Math.round(info.getCurrentVolume() * 100f / info.getMaxVolume()));
        }
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
        if (title.isEmpty() && isAdvertisementNotification(extras)) title = "Advertisement";
        if (title.isEmpty()) return null;
        String artist = textCs != null ? textCs.toString().trim() : "";
        String album = subTextCs != null ? subTextCs.toString().trim() : "";
        String pkg = safeString(sbn.getPackageName());
        String appName = resolveAppLabel(context, pkg);
        boolean isAd = isAdvertisementNotification(extras);
        selectController(null);

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
        obj.put("artwork", readArtwork(context, null, sbn, pkg + "|" + title + "|" + artist + "|" + album));
        obj.put("updatedAt", System.currentTimeMillis());
        return obj;
    }

    private static boolean isAdvertisementMetadata(String title, String artist, String album) {
        String t = safeString(title).toLowerCase(Locale.ROOT);
        String a = safeString(artist).toLowerCase(Locale.ROOT);
        String alb = safeString(album).toLowerCase(Locale.ROOT);
        if (t.equals("advertisement") || t.equals("ad") || t.equals("sponsored")
                || t.equals("spotify") || t.equals("spotify free")
                || t.equals("audio ad") || t.equals("video ad")
                || t.startsWith("advertisement ·") || t.startsWith("advertisement -")
                || t.contains("sponsored message")) {
            return true;
        }
        if (a.equals("advertisement") || a.equals("sponsored") || a.equals("spotify") || a.equals("spotify ad")) {
            return true;
        }
        return alb.equals("advertisement");
    }

    private static boolean isAdvertisementNotification(Bundle extras) {
        if (extras == null) return false;
        if (hasAdvertisementFlag(extras)) return true;
        return isAdvertisementMetadata(String.valueOf(extras.getCharSequence(Notification.EXTRA_TITLE, "")),
            String.valueOf(extras.getCharSequence(Notification.EXTRA_TEXT, "")),
            String.valueOf(extras.getCharSequence(Notification.EXTRA_SUB_TEXT, "")));
    }

    private static boolean hasAdvertisementFlag(Bundle extras) {
        if (extras == null) return false;
        Object flag = extras.get(ADVERTISEMENT);
        return Boolean.TRUE.equals(flag) || (flag instanceof Number && ((Number) flag).longValue() != 0);
    }

    private static StatusBarNotification notificationFor(MediaController controller) {
        if (instance == null) return null;
        try {
            StatusBarNotification fallback = null;
            for (StatusBarNotification notification : instance.getActiveNotifications()) {
                if (!controller.getPackageName().equals(notification.getPackageName())) continue;
                Bundle extras = notification.getNotification().extras;
                MediaSession.Token token = extras == null ? null : extras.getParcelable(Notification.EXTRA_MEDIA_SESSION);
                if (token != null && token.equals(controller.getSessionToken())) return notification;
                if (token == null && Notification.CATEGORY_TRANSPORT.equals(notification.getNotification().category)) fallback = notification;
            }
            return fallback;
        } catch (Exception ignored) {}
        return null;
    }

    private static String readArtwork(Context context, MediaMetadata metadata, StatusBarNotification notification, String recording) {
        String uri = metadata == null ? "" : safeString(metadata.getString(MediaMetadata.METADATA_KEY_ALBUM_ART_URI));
        if (uri.isEmpty() && metadata != null) uri = safeString(metadata.getString(MediaMetadata.METADATA_KEY_ART_URI));
        if (uri.isEmpty() && metadata != null) uri = safeString(metadata.getString(MediaMetadata.METADATA_KEY_DISPLAY_ICON_URI));
        String key = recording + "|" + uri + "|" + (notification == null ? 0 : notification.getPostTime());
        if (key.equals(artworkKey)) return cachedArtwork;
        Bitmap bitmap = metadata == null ? null : metadata.getBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART);
        if (bitmap == null && metadata != null) bitmap = metadata.getBitmap(MediaMetadata.METADATA_KEY_ART);
        if (bitmap == null && metadata != null) bitmap = metadata.getBitmap(MediaMetadata.METADATA_KEY_DISPLAY_ICON);
        try {
            if (bitmap == null && notification != null && notification.getNotification().getLargeIcon() != null) {
                Drawable drawable = notification.getNotification().getLargeIcon().loadDrawable(context);
                if (drawable instanceof BitmapDrawable) bitmap = ((BitmapDrawable) drawable).getBitmap();
                else if (drawable != null) {
                    bitmap = Bitmap.createBitmap(384, 384, Bitmap.Config.ARGB_8888);
                    drawable.setBounds(0, 0, 384, 384);
                    drawable.draw(new Canvas(bitmap));
                }
            }
            if (bitmap == null && !uri.isEmpty()) {
                Uri imageUri = Uri.parse(uri);
                if ("https".equals(imageUri.getScheme()) || "http".equals(imageUri.getScheme())) {
                    artworkKey = key;
                    cachedArtwork = uri;
                    return uri;
                }
                if ("content".equals(imageUri.getScheme()) || "android.resource".equals(imageUri.getScheme())) {
                    BitmapFactory.Options options = new BitmapFactory.Options();
                    options.inJustDecodeBounds = true;
                    try (InputStream stream = context.getContentResolver().openInputStream(imageUri)) {
                        BitmapFactory.decodeStream(stream, null, options);
                    }
                    options.inSampleSize = 1;
                    while (options.outWidth / options.inSampleSize > 768 || options.outHeight / options.inSampleSize > 768) options.inSampleSize *= 2;
                    options.inJustDecodeBounds = false;
                    try (InputStream stream = context.getContentResolver().openInputStream(imageUri)) {
                        bitmap = BitmapFactory.decodeStream(stream, null, options);
                    }
                }
            }
            String artwork = "";
            if (bitmap != null && !bitmap.isRecycled()) {
                double scale = Math.min(1, 384.0 / Math.max(bitmap.getWidth(), bitmap.getHeight()));
                Bitmap scaled = Bitmap.createScaledBitmap(bitmap, Math.max(1, (int) (bitmap.getWidth() * scale)),
                    Math.max(1, (int) (bitmap.getHeight() * scale)), true);
                ByteArrayOutputStream output = new ByteArrayOutputStream();
                scaled.compress(Bitmap.CompressFormat.JPEG, 85, output);
                artwork = "data:image/jpeg;base64," + Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP);
                if (scaled != bitmap) scaled.recycle();
            }
            artworkKey = key;
            cachedArtwork = artwork;
            return artwork;
        } catch (Exception ignored) {
            artworkKey = key;
            cachedArtwork = "";
            return "";
        }
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
