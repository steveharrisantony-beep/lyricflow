package com.steveharrisantony.lyricflow;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class AppUpdaterSecurityTest {
    @Test public void acceptsOnlyApkAssetsFromThisRepository() {
        assertTrue(AppUpdaterPlugin.validReleaseUrl("https://github.com/steveharrisantony-beep/lyricsflow-android/releases/download/android-1002/LyricFlow-Android.apk"));
        for (String address : new String[] {
            "http://github.com/steveharrisantony-beep/lyricsflow-android/releases/download/android-1002/LyricFlow-Android.apk",
            "https://github.com.evil.example/steveharrisantony-beep/lyricsflow-android/releases/download/android-1002/LyricFlow-Android.apk",
            "https://github.com/other/repo/releases/download/android-1002/LyricFlow-Android.apk",
            "https://github.com/steveharrisantony-beep/lyricsflow-android/releases/download/android-1002/Other.apk",
            "https://github.com/steveharrisantony-beep/lyricsflow-android/releases/download/android-1002/LyricFlow-Android.apk?redirect=evil"
        }) assertFalse(address, AppUpdaterPlugin.validReleaseUrl(address));
    }
}
