# VaultTV Server

Self-hosted media server. Runs on your PC, serves the full VaultTV web app at `http://your-pc-ip:8080` so any device on your network (or the internet, if you port-forward) can stream your local library from a browser.

---

## Quick Start

### First time
```
Double-click start-and-build.bat
```
This installs dependencies, builds the web app, and starts the server. Then open **http://localhost:8080** in your browser and set your admin password.

### After first time
```
Double-click start.bat
```

---

## Configuration

Edit **`config.json`** (created automatically on first run):

```json
{
  "port": 8080,
  "tmdbKey": "your_tmdb_api_key",
  "jwtSecret": "auto-generated-keep-this-secret",
  "sessionDays": 30,
  "serverName": "My VaultTV",
  "folders": [
    {
      "id": "movies",
      "path": "D:\\Media\\Movies",
      "type": "movie",
      "name": "Movies"
    },
    {
      "id": "shows",
      "path": "D:\\Media\\TV Shows",
      "type": "tv",
      "name": "TV Shows"
    }
  ]
}
```

**TMDB API key** — get a free one at [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api). Required for metadata, posters, and search.

---

## Access From Other Devices

### Same network (LAN)
Open `http://YOUR-PC-IP:8080` on any device on your home network. Find your PC's IP in Settings → Network → Properties (look for IPv4 Address, e.g. `192.168.1.100`).

### From anywhere (internet)
1. Log into your router admin page (usually `192.168.1.1`)
2. Find **Port Forwarding** (sometimes under "NAT" or "Advanced")
3. Add a rule: **External port 8080 → Internal IP (your PC) → Internal port 8080**
4. Find your public IP at [whatismyip.com](https://www.whatismyip.com)
5. Access VaultTV at `http://YOUR-PUBLIC-IP:8080`

> ⚠️ Port forwarding exposes the server to the internet. The admin password protects it — make it strong.

### Dynamic DNS (optional)
If your public IP changes, use a free DDNS service like [DuckDNS](https://www.duckdns.org) to get a stable hostname (e.g. `yourname.duckdns.org:8080`).

---

## Auto-start on Windows Boot

```
Double-click add-to-startup.bat
```

VaultTV Server will launch automatically every time you log into Windows. To remove it: **Task Manager → Startup apps → VaultTV Server → Disable**.

---

## Requirements

- **Node.js** 18 or newer — [nodejs.org](https://nodejs.org)
- **ffmpeg** (optional) — required for transcoding and subtitle fetching. Install via [ffmpeg.org](https://ffmpeg.org) and add to PATH.

---

## Data Storage

All server data is stored in `%APPDATA%\VaultTV\` (Windows) or `~/.config/VaultTV/` (Linux/Mac):

| File | Contents |
|---|---|
| `auth.json` | Admin password hash |
| `library.json` | Scanned media library |
| `progress.json` | Watch progress (synced across all devices) |
| `watched-folders.json` | Active folder watch list |

---

## Resetting Admin Password

Delete `%APPDATA%\VaultTV\auth.json` and restart the server. The setup wizard will appear again.
