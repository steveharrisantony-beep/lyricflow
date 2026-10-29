package com.steveharrisantony.lyricflow;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Exercises WebView -> native HTTPS proxy -> authenticated embedded Express. */
@RunWith(AndroidJUnit4.class)
public class LocalBackendStartupTest {
    @Test
    public void bundledBackendStartsAndServesWebViewWithoutExternalHosting() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            String state = "";
            for (int attempt = 0; attempt < 90; attempt++) {
                CountDownLatch result = new CountDownLatch(1);
                AtomicReference<String> value = new AtomicReference<>("");
                scenario.onActivity(activity -> activity.getBridge().getWebView().evaluateJavascript(
                    "(function(){if(!window.__lfHealthPending){window.__lfHealthPending=true;" +
                    "fetch('/music/health').then(r=>r.ok?r.json():null).then(d=>{" +
                    "window.__lfHealthState=d&&d.ok&&d.providers.includes('jiosaavn')?'ready':'waiting';" +
                    "}).catch(()=>{window.__lfHealthState='waiting'}).finally(()=>{window.__lfHealthPending=false});}" +
                    "return window.__lfHealthState||'waiting'})()",
                    response -> { value.set(response); result.countDown(); }));
                assertTrue("WebView must answer the probe", result.await(5, TimeUnit.SECONDS));
                state = value.get();
                if ("\"ready\"".equals(state)) break;
                Thread.sleep(500);
            }
            assertEquals("Embedded service must become ready through the HTTPS WebView origin", "\"ready\"", state);
            assertTrue(LocalBackendPlugin.getPort() > 0);
            HttpURLConnection unauthorized = (HttpURLConnection) new URL(
                "http://127.0.0.1:" + LocalBackendPlugin.getPort() + "/music/health").openConnection();
            unauthorized.setConnectTimeout(5000);
            unauthorized.setReadTimeout(5000);
            try { assertEquals(403, unauthorized.getResponseCode()); }
            finally { unauthorized.disconnect(); }
        }
    }
}
