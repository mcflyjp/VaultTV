# VaultTV Android / FireTV App

A lightweight WebView wrapper that loads VaultTV from your local network.

## Setup

1. Open `app/src/main/java/app/vaulttv/MainActivity.java`
2. Change `VAULTTV_URL` to your host machine's IP:
   ```java
   private static final String VAULTTV_URL = "http://192.168.1.232:5174";
   ```

## Build

**Requirements**: Android Studio or command-line Android SDK + Gradle

```bash
cd android-app

# Debug APK (sideload on FireTV / Android device)
./gradlew assembleDebug
# Output: app/build/outputs/apk/debug/app-debug.apk

# Install directly via ADB
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## FireTV Sideloading

1. On FireTV: Settings → My Fire TV → Developer Options → ADB Debugging ON + Apps from Unknown Sources ON
2. Find FireTV IP: Settings → My Fire TV → About → Network
3. Connect: `adb connect <firetv-ip>`
4. Install: `adb install -r app-debug.apk`
5. App appears in "Your Apps & Channels" → it is pinnable to the home screen

## D-pad / Remote Control

- **Select / OK** — clicks focused element
- **Back** — browser back (or exits app if no history)
- **Play/Pause** — handled by the web app's keyboard shortcuts (Space key)
- Arrow keys navigate focusable elements

## Notes

- The app locks to landscape — ideal for TV
- Fullscreen video works (HTML5 fullscreen API is forwarded)
- `localStorage` persists between sessions (addons, library cache)
- `usesCleartextTraffic="true"` is set so the companion server (http) works on LAN
