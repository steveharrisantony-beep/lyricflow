# LyricFlow Capacitor 8 / Android release-size optimization.
# Preserve plugin entrypoints and methods addressed by JavaScript strings, including
# the on-device backend, external player, updates, Android TV, and display controls.
-keep class * extends com.getcapacitor.Plugin { *; }
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod

# Android notification listeners are created by the OS from the manifest.
-keep class com.steveharrisantony.lyricflow.MediaNotificationService { *; }

# Node.js for Mobile Apps is required for the device-local HTTP backend.
# Keep its JNI bridge intact even if the app references it indirectly.
-keep class com.janeasystems.nodejsmobile.** { *; }
-keep class io.capawesome.capacitorjs.plugins.nodejs.** { *; }
-keepclasseswithmembers class * {
    native <methods>;
}
