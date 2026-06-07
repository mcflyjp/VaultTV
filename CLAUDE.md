# VaultTV — Project Master Document

> Personal streaming frontend + media manager. Powered by Stremio add-ons, Real-Debrid, and TMDB.
> Built with React + Vite. Runs locally; no backend required.

---

## Quick Start

```bash
cd D:\Documents\VaultTV
npm run dev          # starts on http://localhost:5174
```

`.env` must contain:
```
VITE_TMDB_KEY=6b8aaebf469a696de174799027e8a0ee
```

---

## Project Identity

| Property | Value |
|---|---|
| Name | VaultTV |
| Repo dir | `D:\Documents\VaultTV` |
| GitHub | `mcflyjp/VaultTV` (to be created) |
| Dev port | 5174 |
| Stack | React 18 + Vite + Tailwind v4 + React Router v6 + React Query v5 |
| Metadata | TMDB API (free, personal use, mcflyjp account) |
| Streams | Stremio addon HTTP protocol (no Stremio app required) |
| Debrid | Real-Debrid (configured in Torrentio + Comet addon URLs) |
| Storage | 100% localStorage (no backend, no database) |

---

## Architecture

### No Backend
Everything is client-side React. All state persists to `localStorage`. There is no server, no database, no auth.

### Context Tree (order matters for providers)
```
QueryClientProvider
  ThemeProvider          → theme, changeTheme, THEMES
  LayoutProvider         → density (1/2/3), changeDensity
  DashboardProvider      → sections[], editing, reorder, toggleVisible
  WatchHistoryProvider   → history[], inProgress[], startWatching, updateProgress
  LibraryProvider        → library.movies[], library.shows[], isSaved, toggle
  QueueProvider          → queue[], addToQueue, removeFromQueue, clearQueue
  RatingsProvider        → ratings{}, setRating, getRating
  PlaylistProvider       → playlists[], createPlaylist, addToPlaylist
  ContextMenuProvider    → show, hide, item, position
  ParentalProvider       → enabled, maxRating, pin, isAllowed
  AddonsProvider         → addons[], importFromUrl, getStreams
  BrowserRouter
    App
```

### Key Files
```
src/
  main.jsx              — Provider tree + React root
  App.jsx               — Routes + layout shell (Sidebar + <main>)
  index.css             — CSS custom properties (themes, density, focus rings)

  context/
    ThemeContext.jsx     — 5 themes via data-theme attribute
    LayoutContext.jsx    — Card density (1=comfortable, 2=default, 3=compact)
    DashboardContext.jsx — Ordered home shelf sections, drag/drop, show/hide
    WatchHistoryContext.jsx — Continue watching, progress tracking
    LibraryContext.jsx   — My Movies, My TV Shows, Saved
    QueueContext.jsx     — Play queue (watch next)
    RatingsContext.jsx   — Personal 1–10 ratings
    PlaylistContext.jsx  — Named playlists
    ContextMenuContext.jsx — Right-click menu state
    ParentalContext.jsx  — PIN + certification filter
    AddonsContext.jsx    — Stremio addon management + stream querying

  lib/
    tmdb.js             — TMDB API helpers + video pickers
    addonCatalog.js     — Fetch + TMDB-enrich Stremio addon catalogs

  components/
    Sidebar.jsx         — Left nav (Browse / My Library / Manage)
    HeroBanner.jsx      — Full-bleed hero with trailer background
    MediaCard.jsx       — Poster card with hover overlay + right-click
    MediaShelf.jsx      — Horizontal scroll shelf with D-pad nav
    MediaGrid.jsx       — Wrapping grid for browse pages
    ContinueWatching.jsx — "Continue Your Adventure..." shelf
    DashboardEditor.jsx — Drag/drop section reorder modal
    ContextMenu.jsx     — Right-click floating menu
    ArtworkPicker.jsx   — TMDB poster alternatives + custom URL
    RatingPicker.jsx    — 1–10 star rating modal
    PlaylistModal.jsx   — Add to playlist / create new

  pages/
    Home.jsx            — Category tabs + all shelves
    Search.jsx          — TMDB multi-search
    Detail.jsx          — Movie/TV detail, streams, episodes, background video
    Library.jsx         — My Movies / My TV Shows / Saved
    Queue.jsx           — Current play queue
    Playlists.jsx       — All playlists
    Addons.jsx          — Addon management + Stremio import
    Settings.jsx        — Theme, density, parental controls

DEVLOG.md             — Running session-by-session dev log
CLAUDE.md             — This file (master project reference)
.env                  — VITE_TMDB_KEY (gitignored)
```

---

## Themes

| Theme | Accent | Background |
|---|---|---|
| VaultTV (default) | `#7c3aed` purple | `#0a0a0f` |
| Netflix | `#e50914` red | `#141414` |
| Disney+ | `#0063e5` blue | `#040714` |
| HBO Max | `#b535f5` purple | `#0d0d0d` |
| Prime Video | `#00a8e1` teal | `#0f171e` |

Themes swap instantly via `data-theme` on the root div. Persisted to `localStorage('vt-theme')`.

---

## Installed Addons (mcflyjp Stremio account)

| Addon | Purpose |
|---|---|
| Torrentio RD | Main stream source — torrents + Real-Debrid |
| Comet ElfHosted RD | Torrent/debrid search |
| MediaFusion ElfHosted RD | Universal streams |
| Jackettio RD | Jackett + Real-Debrid |
| DMM Cast | Debrid Media Manager streams |
| Custom Lists Pro | Personal Trakt lists as shelves |
| Cinemeta | IMDB metadata |
| Cyberflix Catalog | Netflix/Prime/Hulu catalogs |
| USA TV | Live US TV channels |
| Anime Kitsu | Anime catalog + streams |
| ThePirateBay+ | TPB streams |
| Stremify | Multi-server streams + Dramacool |
| Maximum Sports | Live sports streams |
| SubSource | Subtitles |

RD API key is baked into Torrentio, Comet, Jackettio, MediaFusion manifest URLs.

---

## Features

### Browsing
- Home: trending hero banner, customisable shelf sections, horizontal scroll
- Category tabs: Home / Movies / TV Shows / Anime
- Movies + TV browse: sort by Popular / Top Rated, filter by Genre
- Search: TMDB multi-search with parental filter
- Parental controls: rating cap (G/PG/PG-13/R), PIN lock, persisted

### Library (My Stuff)
- **My Movies** — saved movies (bookmark button on detail pages)
- **My TV Shows** — saved TV shows
- **Saved** — combined view
- **Queue** — ordered watch-next list
- **Playlists** — custom named lists
- Badge counts in sidebar update live

### Continue Watching
- Section name: **"Continue Your Adventure..."**
- First section on home page
- Tracks via HTML5 video `onPlay` + `onTimeUpdate`
- Progress bar on each card + time remaining
- Hides when empty, × to dismiss individual items

### Detail Page
- Muted background trailer (YouTube, 45% opacity, blurred)
- Theme song ambient audio (auto-detected from TMDB videos)
- Music pill: play/pause + dismiss, auto-dismisses when stream plays
- Find Streams → queries all installed addons simultaneously
- Episode picker for TV shows

### Right-click Context Menu
- Custom `onContextMenu` on every media card
- Options: Play Now · Add to Queue · Save/Unsave · Mark Watched · Rate · Add to Playlist · Change Artwork · More Info
- Artwork picker: TMDB poster alternatives + custom URL
- Rating picker: 1–10 stars, stored locally
- Playlist manager: create named lists, add items to existing lists

### Dashboard Customization
- Customize button → frosted modal editor
- Drag to reorder shelves (desktop: HTML5 drag; mobile: touch)
- Toggle visibility per shelf
- Add Custom Lists Pro shelves as sections

### D-pad / Fire TV Navigation
- All cards `tabIndex=0`, keyboard-focusable
- Arrow keys navigate between cards in a shelf
- Enter/Space activates card
- Purple `focus-visible` ring (3px solid var(--accent))
- Touch-friendly tap targets throughout
- Layout density "Comfortable" recommended for Fire TV

---

## Planned / Future
- [ ] GitHub push (mcflyjp/VaultTV)
- [ ] Fire TV sideload via ADB
- [ ] Stremio account sync (live addon sync without file export)
- [ ] Watchlist sync with Trakt
- [ ] Multiple user profiles
- [ ] Watch party mode
- [ ] Cast to Chromecast
- [ ] Subtitle selection in player
- [ ] Download for offline (RD cached files)
