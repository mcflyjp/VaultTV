# VaultTV

A personal streaming frontend for movies and TV shows. Browse TMDB metadata, pull streams from Stremio add-ons via Real-Debrid, and watch on any device — web browser, Electron desktop app, or FireTV stick.

---

## Features

- 🎬 Browse and search movies & TV shows (TMDB metadata)
- 🔌 Stremio add-on support — Comet, Torrentio, Metafusion, and more
- 💳 Real-Debrid integration for fast, cached streams
- 📺 FireTV APK with native ExoPlayer + VLC fallback for all audio codecs
- 📂 Local library — scan your own media files
- 📋 Watchlists, playlists, and queue
- ⏯ Continue watching with resume position
- 🎨 5 themes: Vault Max, Vault Prime, Vaultflix, Vault+, and default
- 🔔 Firebase push notifications (FireTV)

---

## Devices

| Platform | How to use |
|---|---|
| Web browser | Open the hosted URL or run `npm run dev` locally |
| Desktop (Windows/Mac) | Electron app — `npm run electron` |
| FireTV / Fire Stick | Install the APK (see below) |
| Android phone | Sideload the same APK via adb |

---

## FireTV APK — Installation

### Requirements
- Fire TV Stick (any generation) or Fire TV Cube
- ADB enabled on the device **or** use the [Downloader app](https://www.amazon.com/dp/B01N0BP507)

### Install via Downloader (easiest — no PC needed)
1. On your FireTV, install **Downloader** from the Amazon App Store.
2. Open Downloader and enter the direct APK link from the [latest release](https://github.com/mcflyjp/VaultTV/releases).
3. When prompted, enable **Install unknown apps** for Downloader.
4. Follow the install prompts.

### Install via ADB (PC required)
```bash
# Enable ADB on FireTV: Settings → My Fire TV → Developer Options → ADB Debugging ON
# Find your FireTV IP: Settings → My Fire TV → About → Network

adb connect <FIRETV_IP>:5555
adb install -r app-debug.apk
```

### First launch
1. Open **VaultTV** from your apps list.
2. The app loads the web frontend inside a native shell.
3. Follow the **Setup Guide** below (or tap **How To** in the sidebar) to add stream sources.

---

## Setup Guide — Add-ons & Real-Debrid

VaultTV uses Stremio-compatible add-ons for streams. You need at least one stream add-on and (strongly recommended) a Real-Debrid subscription.

---

### Step 1 — Real-Debrid

Real-Debrid is a paid service (~€4/month) that gives you fast, cached links from file-hosting sites. Most quality stream add-ons require it.

1. Go to **real-debrid.com** and create an account.
2. Click **Premium offers** and subscribe to a plan (180-day is the best value).
3. Once subscribed, go to **My Account → API Key** (or `real-debrid.com/apitoken`).
4. Copy the API token — you'll paste this into each stream add-on configurator.

> ⚠️ Keep your API key private. Anyone with it can use your Real-Debrid quota.

---

### Step 2 — Comet ☄️

Comet is a Real-Debrid powered stream add-on. One of the best available.

1. Search **"Comet Stremio configurator"** in your browser to find the current hosted instance (community forums like r/StremioAddons usually have a pinned link).
2. Under **Debrid Provider**, select **Real-Debrid** and paste your API key.
3. Set your preferred quality/language filters (defaults are fine to start).
4. Click **Install** at the bottom and copy the manifest URL (ends in `/manifest.json`).
5. In VaultTV: **Add-ons → Add by Manifest URL** → paste → **Add**.

> 💡 This URL contains your API key — do not share it publicly.

---

### Step 3 — Metafusion 🔗

Metafusion combines catalogs from multiple sources (Trakt, IMDb lists, etc.) into one browseable library.

1. Search **"Metafusion Stremio addon"** for the current configurator URL.
2. Optionally connect your **Trakt** or **IMDb** account to pull your watchlists.
3. Select which catalogs you want visible.
4. Click **Install** and copy the manifest URL.
5. In VaultTV: **Add-ons → Add by Manifest URL** → paste → **Add**.

> ℹ️ Metafusion provides browsing/catalogues only — it does not serve video streams. You still need Comet or Torrentio for playback.

---

### Step 4 — Torrentio 🌊 (optional)

The most widely used stream add-on. Pairs with Real-Debrid for instant cached streams.

1. Go to **torrentio.strem.fun**.
2. Under **Debrid Provider**, select **Real-Debrid** and click **Authorize** — sign in and approve.
3. Set your quality ceiling (e.g. max 1080p or allow 4K) and source preferences.
4. Click **Install** and copy the manifest URL.
5. In VaultTV: **Add-ons → Add by Manifest URL** → paste → **Add**.

> 💡 Using both Comet and Torrentio gives better coverage — one may have a cache hit when the other doesn't.

---

### Already using Stremio? Import everything at once 📦

Skip manual setup by exporting your existing Stremio configuration.

1. In Stremio: **Profile → Settings → General → Export user data** — a `.json` file downloads.
2. In VaultTV: **Add-ons → Import from Stremio Settings File** → choose the JSON file.
3. VaultTV imports all your add-ons automatically (localhost add-ons are skipped).
4. Click **Sync Catalogs** to refresh content lists.

---

### Final Check ✅

1. Go to **Add-ons** — confirm at least one stream add-on is listed.
2. Search for a popular title (e.g. *Inception* or *Breaking Bad*).
3. Open the detail page and look at the **Sources** section.
4. Pick a stream tagged **RD** (Real-Debrid cached) for the fastest playback.
5. It should begin playing immediately.

---

### Troubleshooting

| Problem | Fix |
|---|---|
| No streams appear | Check add-on is installed; click Sync Catalogs; verify Real-Debrid subscription is active |
| Add-on token expired | Re-run the add-on's configurator and re-paste the new manifest URL |
| Video won't play on FireTV | App automatically retries with VLC for unsupported audio codecs |
| Import shows "Nothing new to import" | Add-ons were already up to date |
| Comet/Torrentio shows no results | Try the other add-on; rare titles may not be cached on Real-Debrid yet |

---

## Running Locally (Development)

```bash
# Install dependencies
npm install

# Start dev server (port 5174)
npm run dev

# Production build
npm run build
```

### Build the FireTV APK

Requirements: Android Studio installed at `D:\MEDIA\Programs\Android\Android Studio`

```bash
cd android-app
build-apk.bat        # sets JAVA_HOME automatically and runs Gradle
```

Output: `android-app/app/build/outputs/apk/debug/app-debug.apk`

---

## Project Structure

```
VaultTV/
├── src/                    # React web frontend (Vite)
│   ├── components/         # Sidebar, TopNav, VideoPlayer, ContinueWatching…
│   ├── context/            # Theme, Library, WatchHistory, Player, Addons…
│   ├── pages/              # Home, Detail, Search, Addons, Guide, Settings…
│   └── lib/                # TMDB API, companion server, stream helpers
├── android-app/            # Android APK (WebView shell)
│   ├── app/src/main/java/app/vaulttv/
│   │   ├── MainActivity.java        # WebView host + JS bridge
│   │   ├── PlayerActivity.java      # ExoPlayer (hardware decode)
│   │   └── VlcPlayerActivity.java   # VLC fallback (software decode)
│   ├── build-apk.bat                # One-click APK build script
│   └── CHANGES.md                   # APK change log with revert instructions
└── companion/              # Optional local companion server (library scan)
```

---

## Releases

See [Releases](https://github.com/mcflyjp/VaultTV/releases) for the latest APK download.
