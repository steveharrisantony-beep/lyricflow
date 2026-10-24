# Firestore Security Specification — LyricFlow

## 1. Data Invariants
1. **Identity Ownership**: Every `/userPreferences/{userId}` document and `/userPreferences/{userId}/songDelays/{songId}` document can only be read, created, updated, or deleted by the authenticated user whose `request.auth.uid == userId` and `request.auth.token.email_verified == true`.
2. **Relational Parent Integrity**: A `/userPreferences/{userId}/songDelays/{songId}` document requires the parent `/userPreferences/{userId}` document to belong to `request.auth.uid` and verifies `incoming().uid == request.auth.uid` and `incoming().songId == songId`.
3. **Strict Schema & Bounds**:
   - `enabledScenes` must be a list with `1 <= size() <= 40` and `enabledScenes[0] is string`.
   - `enabledKineticMotions` must be a list with `1 <= size() <= 8` and `enabledKineticMotions[0] is string`.
   - `delaySeconds` must be a number between `-30` and `30`.
   - `createdAt` must equal `request.time` on creation and remain immutable on update.
   - `updatedAt` must equal `request.time` on both creation and update.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unauthenticated Write**: `auth = null` attempting `create` on `/userPreferences/user_1`. -> `PERMISSION_DENIED`
2. **Unverified Email Spoof**: `auth = { uid: 'user_1', token: { email_verified: false } }` attempting `create` on `/userPreferences/user_1`. -> `PERMISSION_DENIED`
3. **Cross-User Read (PII/Preference Leak)**: `auth = { uid: 'user_2', token: { email_verified: true } }` attempting `get` on `/userPreferences/user_1`. -> `PERMISSION_DENIED`
4. **UID Mismatch Injection**: `auth = { uid: 'user_1' }` writing `uid: 'user_2'` inside `/userPreferences/user_1`. -> `PERMISSION_DENIED`
5. **Shadow / Ghost Field Injection**: Including `"isAdmin": true` in `/userPreferences/user_1` creation or update. -> `PERMISSION_DENIED`
6. **Empty or Oversized Theme Array**: `enabledScenes: []` or 50 items (> 40 limit). -> `PERMISSION_DENIED`
7. **Out-of-Range Numeric Settings**: `intensity: 999` or `delaySeconds: 120` (outside `[-30, 30]`). -> `PERMISSION_DENIED`
8. **Forged Client Timestamp on Create**: Setting `createdAt` to a past timestamp instead of `request.time`. -> `PERMISSION_DENIED`
9. **Mutating Immutable `createdAt` or `uid` on Update**: Changing `createdAt` or `uid` during an update to `/userPreferences/user_1`. -> `PERMISSION_DENIED`
10. **Path Variable Poisoning**: Using an invalid `songId` containing spaces or exceeding 128 chars. -> `PERMISSION_DENIED`
11. **Orphaned SongDelay Creation**: Creating `/userPreferences/user_1/songDelays/song_abc` when `/userPreferences/user_1` does not exist. -> `PERMISSION_DENIED`
12. **Unauthorized Collection Listing**: Listing `/userPreferences/user_1/songDelays` as `user_2`. -> `PERMISSION_DENIED`
