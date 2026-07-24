# VaultTV Android / FireTV App

A lightweight WebView wrapper that loads VaultTV — works on FireTV Stick, Android TV, and any Android device.

---

## Install on FireTV (Easiest — no PC needed)

### Option A — Downloader App Short Code

1. Install **Downloader** (free) from Amazon Appstore on your FireTV
2. Open Downloader → enter code: **`6945467`**
   - Short URL: `aftv.news/6945467`
3. Tap Download → Install → Open

> Settings → My Fire TV → Developer Options → **Apps from Unknown Sources: ON** (required once)

### Option B — Direct APK URL in Downloader

Open Downloader → enter this URL directly:
```
https://github.com/mcflyjp/VaultTV/releases/download/v2026.06.08/VaultTV-FireTV.apk
```
> The APK asset is always replaced in place on the `v2026.06.08` tag (never a new tag) so this URL — and the `aftv.news/6945467` short code above, which points at it — never change.

### Option C — ADB (same Wi-Fi as host PC)

```bash
# Find FireTV IP: Settings → My Fire TV → About → Network
adb connect <firetv-ip>
adb install -r VaultTV-FireTV.apk
```

---

## GitHub Release

Latest desktop/full release notes: https://github.com/mcflyjp/VaultTV/releases/latest
FireTV APK (stable link, see note above): https://github.com/mcflyjp/VaultTV/releases/tag/v2026.06.08

---

## Setup — Point App at Your VaultTV Instance

Open `app/src/main/java/app/vaulttv/MainActivity.java` and set `VAULTTV_URL`:

```java
// Option A: hosted URL (works anywhere)
private static final String VAULTTV_URL = "https://vaulttv.pages.dev";

// Option B: LAN (same network as host PC running VaultTV)
private static final String VAULTTV_URL = "http://192.168.1.232:5174";
```

---

## Build from Source

**Requirements**: Android Studio (includes SDK + Gradle)

```bash
cd android-app

# Generate Gradle wrapper (first time only)
gradle wrapper --gradle-version 8.9

# Build debug APK
./gradlew assembleDebug
# Output: app/build/outputs/apk/debug/app-debug.apk

# Install via ADB
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

---

## Remote Control / D-pad

| Button | Action |
|---|---|
| Select / OK | Click focused element |
| Back | Browser back (exits app if no history) |
| Play/Pause | Space key (handled by web player) |
| Arrow keys | Navigate focusable elements |

---

## Notes

- Locked to landscape — ideal for TV
- HTML5 fullscreen video works (forwarded to system fullscreen)
- `localStorage` persists between sessions (addons, library, settings)
- `usesCleartextTraffic="true"` allows http:// companion server on LAN
- FireTV home screen banner included (320×180 `VAULTTV` graphic)
