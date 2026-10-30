# Android app updates

Open **App updates** in LyricFlow's header. The current version and build number
are shown here, including in the browser preview.

1. Tap **Check for updates**. Only newer stable Android releases are offered.
2. Tap **Download update**. The APK downloads inside the Android app, without a ZIP.
3. LyricFlow verifies the SHA-256 checksum, application ID, version and signing key.
4. Tap **Install update**. If Android requests permission to install from LyricFlow,
   enable it, return to LyricFlow and tap **Install update** again.
5. Confirm the Android installer. Compatible updates keep existing app data.

Downloads are limited to this repository's HTTPS GitHub Release APK assets. They
are stored in app-private cache and shared only with Android's installer. The app
does not embed a GitHub token or private signing key.

## One-time permanent signing setup

The APK build works without signing secrets, producing a debug APK for testing.
Debug builds are not published as in-app updates: GitHub's temporary debug keys
can differ between runners. There are currently no reliable in-app release
updates until the repository owner configures a permanent private signing key.

In GitHub repository **Settings > Secrets and variables > Actions**, add these
repository secrets:

| Secret | Value |
| --- | --- |
| ANDROID_SIGNING_KEYSTORE_BASE64 | The private signing keystore encoded as base64 |
| ANDROID_SIGNING_STORE_PASSWORD | Its keystore password |
| ANDROID_SIGNING_KEY_ALIAS | The signing key alias, for example lyricflow |
| ANDROID_SIGNING_KEY_PASSWORD | That key's password |

The same signing key must be kept for all future releases. Keep a private backup.
Do not paste the key or passwords into AI Studio, chat prompts or repository files.

### Creating a key with only a tablet

A browser-based GitHub Codespace can run the commands below; no PC installation
is required. If you already have a private signing keystore, use that instead.

1. Open this repository's **Code > Codespaces** and create a Codespace.
2. Open its terminal and run:

   keytool -genkeypair -keystore /tmp/lyricflow-release.jks -alias lyricflow -keyalg RSA -keysize 3072 -validity 10000 -dname "CN=LyricFlow"

   Choose a strong private password at the hidden prompt. Keep it and the alias.
3. Run:

   base64 -w 0 /tmp/lyricflow-release.jks

   Copy the complete output into ANDROID_SIGNING_KEYSTORE_BASE64 using GitHub's
   secrets form. Add the other three secrets there.
4. Download the keystore from the Codespace file explorer to a secure private
   location before deleting the Codespace. A lost key cannot sign future updates.

This credential setup is performed by the repository owner; it is not generated
or stored by the app.

## Publishing updates

After adding the four secrets, push to main or run **Build Android APK** manually.
The workflow assigns an increasing version code, builds a signed release APK,
runs the checks and Android emulator tests, then publishes the tested APK as a
stable GitHub Release tagged android-VERSION_CODE. Release assets use the name
LyricFlow-Android.apk. GitHub's asset SHA-256 digest is required by the update checker.

Without secrets, the same workflow still builds a test APK under
**Artifacts > LyricFlow-Android**, but skips publishing. Partially configured
signing secrets fail the build rather than silently switching signing identity.

A previously installed debug APK normally cannot accept a release APK signed
with a new private key. Export any local data first; do not uninstall until you
have a backup and understand that uninstalling clears app-local data. Once the
first permanently signed release is installed, future releases signed with that
same key can update it in place.

The checker handles unavailable networks, GitHub rate limits, missing releases,
malformed metadata, older versions and unverified assets. Installation prompts
and actual update persistence still need testing on your Xiaomi Pad 8 with two
releases signed with your own key.
