# VaultTV APK Change Log

## 2026-06-10 — Dual player (ExoPlayer / VLC split)

### What changed
- **`app/build.gradle`** — Added `org.videolan.android:libvlc-all:3.6.0` dependency
- **`settings.gradle`** — Added `jcenter()` repository (required for libVLC)
- **`VlcPlayerActivity.java`** — NEW file. VLC-based player for non-FireTV Android devices. Supports AC3, EAC3, DTS, and all other codecs via software decode. Returns position/duration to MainActivity on back, same as PlayerActivity.
- **`MainActivity.java` (`playVideo` bridge method)** — Now detects FireTV via `getPackageManager().hasSystemFeature("amazon.hardware.fire_tv")`. Routes to `PlayerActivity` on FireTV, `VlcPlayerActivity` on all other Android devices.
- **`AndroidManifest.xml`** — Registered `VlcPlayerActivity`.

### FireTV code path (UNCHANGED)
`PlayerActivity.java` is **not modified**. FireTV devices detected via `amazon.hardware.fire_tv` system feature — this is the official Amazon API for FireTV detection and is reliable across all Fire Stick / Fire TV Cube models.

### To revert if FireTV breaks
1. In `MainActivity.java`, change `playVideo` to always use `PlayerActivity.class` (remove the `isFireTV` branch)
2. FireTV will use ExoPlayer again exactly as before

---

## 2026-06-10 — English audio default (ExoPlayer)

### What changed
- **`PlayerActivity.java`** — Added `.setPreferredAudioLanguage("en")` to DefaultTrackSelector. Removed `.setPreferredAudioMimeType("audio/mp4a-latm")` (was causing audio failures on non-FireTV Android).

### To revert
Remove `.setPreferredAudioLanguage("en")` from trackSelector parameters in `PlayerActivity.java`.

---

## 2026-06-10 — Back button + Exit app

### What changed
- **`MainActivity.java` (`onKeyDown`)** — Removed `webView.goBack()`. Back now delegates entirely to `window.__vaulttvBack` (React Router). Prevents SPA history stack from getting stuck.
- **`VaultTVBridge.exitApp()`** — NEW bridge method. Calls `finishAndRemoveTask()` to fully close app from the "Exit VaultTV" sidebar button.

### To revert back button behavior
Add `else if (webView.canGoBack()) { webView.goBack(); }` after the `evaluateJavascript` call in `onKeyDown`.
