package com.steveharrisantony.lyricflow;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.filters.SdkSuppress;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Assume;
import org.junit.Test;
import org.junit.runner.RunWith;

/** A muted WebContents must not take focus from an existing native audio-focus owner. */
@RunWith(AndroidJUnit4.class)
@SdkSuppress(minSdkVersion = 26)
public class ExternalAudioFocusTest {
    private static String evaluate(ActivityScenario<MainActivity> scenario, String expression) throws Exception {
        CountDownLatch result = new CountDownLatch(1);
        AtomicReference<String> value = new AtomicReference<>("");
        scenario.onActivity(activity -> activity.getBridge().getWebView().evaluateJavascript(expression, response -> {
            value.set(response); result.countDown();
        }));
        assertTrue("WebView must answer", result.await(5, TimeUnit.SECONDS));
        return value.get();
    }

    @Test public void externalPolicyAllowsVideoPlaybackWithoutTakingNativeAudioFocus() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            AtomicReference<AudioManager> manager = new AtomicReference<>();
            scenario.onActivity(activity -> manager.set((AudioManager) activity.getSystemService(Context.AUDIO_SERVICE)));
            Assume.assumeTrue(WebViewFeature.isFeatureSupported(WebViewFeature.MUTE_AUDIO));
            // A JavaScript probe issued during the initial document navigation can lose
            // its callback. Retry read-only startup probes within one cold-boot deadline.
            long readyBy = System.nanoTime() + TimeUnit.SECONDS.toNanos(60);
            boolean canvasReady = false;
            while (System.nanoTime() < readyBy) {
                CountDownLatch probe = new CountDownLatch(1);
                AtomicReference<String> ready = new AtomicReference<>("");
                scenario.onActivity(activity -> activity.getBridge().getWebView().evaluateJavascript(
                    "Boolean(document.querySelector('.cinematic-canvas'))", response -> {
                        ready.set(response); probe.countDown();
                    }));
                if (probe.await(3, TimeUnit.SECONDS) && "true".equals(ready.get())) {
                    canvasReady = true; break;
                }
                Thread.sleep(250);
            }
            assertTrue("The real app canvas must become ready after cold startup", canvasReady);
            assertEquals("true", evaluate(scenario, "Boolean(document.querySelector('.cinematic-canvas'))"));
            // Let the app's initial non-external policy settle before explicitly configuring the test.
            Thread.sleep(400);
            AtomicInteger losses = new AtomicInteger();
            AudioFocusRequest focus = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build())
                .setOnAudioFocusChangeListener(change -> {if (change < 0) losses.incrementAndGet();}, new Handler(Looper.getMainLooper()))
                .build();
            assertEquals(AudioManager.AUDIOFOCUS_REQUEST_GRANTED, manager.get().requestAudioFocus(focus));
            int rate = 8000, samples = rate * 2;
            ByteBuffer wav = ByteBuffer.allocate(44 + samples * 2).order(ByteOrder.LITTLE_ENDIAN);
            wav.put(new byte[]{'R','I','F','F'}).putInt(36 + samples * 2).put(new byte[]{'W','A','V','E','f','m','t',' '});
            wav.putInt(16).putShort((short)1).putShort((short)1).putInt(rate).putInt(rate * 2).putShort((short)2).putShort((short)16).put(new byte[]{'d','a','t','a'}).putInt(samples * 2);
            for (int i = 0; i < samples; i++) wav.putShort((short)(Math.sin(i * 2 * Math.PI * 220 / rate) * 3000));
            String encoded = Base64.encodeToString(wav.array(), Base64.NO_WRAP);
            try {
                evaluate(scenario, "window.__focusState='waiting';window.Capacitor.Plugins.MediaPlaybackPolicy.configure({externalPlayer:true}).then(r=>{if(!r.safeBackground)throw Error('unsafe');const a=document.createElement('audio');window.__focusAudio=a;a.src='data:audio/wav;base64," + encoded + "';a.loop=true;document.body.append(a);return a.play()}).then(()=>window.__focusState='playing').catch(e=>window.__focusState=String(e));");
                String state = "";
                for (int i = 0; i < 30; i++) {
                    state = evaluate(scenario, "window.__focusState");
                    if ("\"playing\"".equals(state)) break;
                    Thread.sleep(200);
                }
                assertEquals("Muted WebView media must actually start", "\"playing\"", state);
                Thread.sleep(1000);
                assertEquals("The original focus owner must not be paused or ducked", 0, losses.get());
                scenario.onActivity(activity -> assertTrue(WebViewCompat.isAudioMuted(activity.getBridge().getWebView())));
            } finally {
                evaluate(scenario, "if(window.__focusAudio){window.__focusAudio.pause();window.__focusAudio.remove()}");
                manager.get().abandonAudioFocusRequest(focus);
                scenario.onActivity(activity -> WebViewCompat.setAudioMuted(activity.getBridge().getWebView(), false));
            }
        }
    }
}
