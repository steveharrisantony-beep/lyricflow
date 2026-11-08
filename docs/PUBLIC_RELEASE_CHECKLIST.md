# Public-release checklist for LyricFlow

The GitHub repository may be made public when the **owner** has reviewed these items. This checklist is guidance, not a statement that the repository or past commits have been cleared of all risk.

## 1. Check the *entire* history, not only the current files

- [ ] Review Git history, branches, tags, releases and old workflow artifacts for credentials or user data. In particular, an older tracked `firebase-applet-config.json` existed before Firebase was removed from the current tree.
- [ ] Review every old `.env`, `google-services.json`, service-account file, OAuth client secret, API token, cookie, signing keystore, CI output and commit diff.
- [ ] **Rotate/revoke** a credential if it was ever committed or exposed. Removing the file in a new commit is *not* enough; the old blob may remain accessible after the repository is made public.
- [ ] If private values have to be purged, follow GitHub's official guidance for sensitive-data removal, then rotate any exposed credentials. Rewriting history can disrupt clones and pull requests; coordinate before doing it.

Firebase web configuration fields (including browser API keys) are generally public identifiers, but **they are not automatically harmless for every use**. Check API restrictions, product quotas, previously deployed security rules and any associated resources before publication. Never assume removed services have stopped accepting old credentials.

## 2. Account and provider boundaries

- [ ] Confirm Firebase projects, user databases, account tokens and previous cloud data are no longer reachable unintentionally.
- [ ] Review YouTube cookie/OAuth features separately from the removed Firebase authentication. Never include real cookies, access tokens or account details in test fixtures.
- [ ] Review third-party provider terms, rate limits and copyright issues before distributing APKs. A backend embedded on the device still makes network requests to external services.
- [ ] Verify that error logs, screenshots and JSON exports do not contain personal credentials before attaching them to public issues.

## 3. Android and update signing

- [ ] Keep release signing keystores and passwords **outside Git**, including old commits and artifacts.
- [ ] Keep a permanent private backup of release-signing material. Changing signing identity can prevent updates from installing over earlier releases.
- [ ] Confirm that published APKs are built from a reviewed commit and that the GitHub Actions job succeeds.
- [ ] Keep app updates checksum-verified and Android installation approval user-controlled.
- [ ] Review permissions: internet, audio capture, notification listening and APK installation. Make the user-facing explanation match actual behavior.

## 4. Repo ownership and licensing

- [ ] Select a source-code license before presenting the project as open source. **No LICENSE file exists at the time this checklist was added.**
- [ ] Confirm rights to redistribute all images, fonts, icons, sample lyrics, code extracts and bundled files; project code and third-party media have different permissions.
- [ ] Review `README.md`, `ANDROID.md`, `SONG_MAPPING_DATA.md`, release descriptions and app store listings for old Firebase or capability claims.
- [ ] Consider enabling Dependabot/security alerts and private vulnerability reporting in GitHub settings.

## 5. Functional verification

- [ ] Automatic **Typecheck and build** workflow passes.
- [ ] Automatic **Browser packaging smoke test** passes, including 320px mobile width.
- [ ] Test local file playback, JioSaavn/YouTube lookup, lyric fallback, romanization, theme/video switching, fullscreen Settings close and mapping export/import.
- [ ] On a real Android device test External Player permissions, notification metadata, audio capture, background video recovery and an installed/signed update.
- [ ] Check that offline local audio and imported lyrics continue to work when a provider is unavailable.

## Publishing

After checks are complete, change repository visibility through **GitHub → Settings → General → Danger Zone → Change repository visibility**.

**Reminder:** Making a repository public publishes historical content too. A source review can reduce risk but cannot guarantee that all existing or historical secrets have been found.
