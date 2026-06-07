# VaultTV Dev Log

---

## Session 1 — Project Bootstrap
**Date:** 2026-06-06

### Decisions
- Project name: **VaultTV** (confirmed clear of trademark conflicts — "Vault TV" exists as a small Roku channel, no trademark risk)
- Stack: React + Vite + Tailwind CSS + React Router v6 + React Query v5
- Metadata: TMDB API (free personal-use key, account: mcflyjp)
- Streams: Stremio addon HTTP endpoints queried directly — no Stremio app required at runtime
- Theme system: CSS custom properties (`--accent`, `--bg-primary`, etc.) swapped via `data-theme` attribute on root
- Layout density: CSS `data-density` attribute controls card width via `--card-width` token
- Port: 5174 (5173 occupied by BitClip/ClipForge dev server)
- Repo location: `D:\Documents\VaultTV`

### Architecture
- **Frontend only** — no backend server. All state in React contexts, persisted to localStorage.
- **Context tree**: QueryClient → Theme → Layout → Dashboard → WatchHistory → Library → Parental → Addons → Router → App
- **Routing**: BrowserRouter, routes defined in App.jsx

### Features Built
- [x] ThemeContext — 5 themes: VaultTV (purple #7c3aed), Netflix (red), Disney+ (blue), HBO (purple), Prime (teal). Persisted to localStorage.
- [x] ParentalContext — PIN lock + TMDB certification rating filter (G/PG/PG-13/R/NC-17). PIN stored in localStorage.
- [x] AddonsContext — localStorage-backed addon list, importFromUrl, getStreams (queries all installed addons), saveAddons.
- [x] Sidebar — BROWSE (Home, Search) · MY LIBRARY (My Movies, My TV Shows, Saved) · MANAGE (Add-ons, Settings). Badge counts on library items. Theme picker at bottom.
- [x] Home page — HeroBanner + category tabs (Home/Movies/TV/Anime). Customize button opens dashboard editor.
- [x] Search page — TMDB multi-search, parental filter applied, results grid.
- [x] Detail page — backdrop + poster, metadata badges, Find Streams, Watch Trailer, Save button, background trailer (muted YT iframe), theme song pill.
- [x] Addons page — add by manifest URL, import Stremio settings file.
- [x] Settings page — theme picker, layout density, parental controls (toggle/rating/PIN), About.
- [x] Library page — My Movies / My TV Shows / Saved views with remove buttons.
- [x] TMDB lib — getTrending, getPopular, getTopRated, search, getDetail, getSeason, getSimilar, getVideos, getCertification, pickTrailer, pickTheme.

### TMDB API Key
- Key: `6b8aaebf469a696de174799027e8a0ee` (mcflyjp account, free developer plan)
- Stored in `.env` as `VITE_TMDB_KEY`

---

## Session 2 — UI Redesign + Core Features
**Date:** 2026-06-06

### UI — VaultTV Original Style
- Replaced top navbar with left sidebar (Sidebar.jsx)
- Horizontal scroll shelves (MediaShelf.jsx) — Plex-style but unique to VaultTV
- MediaCard: hover/focus overlay with purple play button, title, year, star rating
- HeroBanner: meta badges (year · type · ⭐ · runtime · certification), left-fade gradient
- Category tabs on Home: Home / Movies / TV Shows / Anime
- Movies + TV browse tabs: sort pills (Popular / Top Rated) + Genre dropdown (14 genres each)
- Layout density (Comfortable=200px / Default=150px / Compact=110px) — Settings → Card Size
- D-pad keyboard navigation: `tabIndex=0` on cards, `onKeyDown` arrow traversal between shelf cards, `focus-visible` purple ring (3px solid var(--accent))
- Touch-friendly: `-webkit-tap-highlight-color`, large tap targets, `onFocus`/`onBlur` = hover state
- `data-density` CSS attribute drives `--card-width` token

### Detail Page — Immersive Experience
- Background trailer: YouTube no-cookie embed, muted, autoplay, loop, no controls, opacity 0.45, blur(2px) brightness(0.6), covers full viewport via `position: fixed`
- Theme song: TMDB videos API — searches for "theme/score/soundtrack/main title/opening/music" in video names. Hidden iframe plays audio. Floating pill bottom-right: 🎵 Theme + volume toggle + dismiss.
- Theme auto-dismisses when user starts playing a stream
- Watch Trailer: links to YouTube in new tab
- Save button: bookmark icon, fills purple when saved, toggles off
- All metadata badges: rating, year, runtime, certification, season count (TV)
- Episode list: season picker dropdown, episode stills, keyboard-navigable (Enter = play)
- Video player: `onPlay` → startWatching, `onTimeUpdate` → updateProgress (every frame)

### Dashboard Customization
- DashboardContext: ordered sections array persisted to localStorage, drag/drop reorder
- Customize button on Home → frosted-glass modal
- Drag & drop reorder: desktop = HTML5 drag API (`draggable`, `onDragStart/Over/Drop`); mobile/TV = touch events (`onTouchStart/Move/End`)
- Eye toggle (👁/🚫) per section — hides shelf without deleting
- Reset to defaults button
- Add-on sections from Custom Lists Pro: Movies, TV Shows, Dad's Movies, Mom's Movies, Kids Shows, Kids Movies, Disney Plus, My Watchlist, Shows — each addable via + Add button
- Add-on section badge shows "Add-on" pill in purple

### Addon Catalog Integration
- `addonCatalog.js`: fetches Stremio addon catalog endpoints, preserves JWT token in query string via `new URL()` manipulation
- TMDB `/find/{imdb_id}?external_source=imdb_id` enrichment: converts IMDB IDs from Stremio metas to full TMDB objects with posters
- `AddonShelf` component: lazy loads via React Query, shows loading header, hides silently on error (no broken UI)
- **Known issue**: Custom Lists Pro Trakt catalogs return 500 if Trakt token is expired. Fix: reconnect Trakt in Stremio → re-export → re-import.

### Library System
- `LibraryContext`: `{ movies: [], shows: [] }` persisted to localStorage. `toggle()` adds/removes items.
- `WatchHistoryContext`: tracks items started watching with `progressSec`, `durationSec`, `progress` (0–1). Max 30 items sorted by recency.
- My Movies / My TV Shows / Saved pages (Library.jsx) — grid of saved items with remove buttons
- Sidebar badge counts update live

### "Continue Your Adventure..." Section
- `ContinueWatching.jsx` component — appears as the FIRST section on Home (above all shelves)
- Only shows items with `progress < 0.95` (not fully watched)
- Each card shows: poster, progress bar (accent colour), time remaining, × dismiss button
- Hides completely when list is empty
- Tracks via video `onPlay` / `onTimeUpdate` events on the HTML5 video player

### Stremio Import
- Settings file parser fixed: Stremio v5 exports as `data.addons.addons[]` (nested), not `data.addons[]`
- Reads manifests directly from the embedded JSON — no network fetch on import
- Skips localhost/127.0.0.1 addons (Local Files addon can't work outside Stremio)
- Skips duplicates on re-import
- 14 addons imported from user's Stremio export (mcflyjp account)

### Bugs Fixed
- `getCertification` crash on undefined detail → added null guard
- Addon catalog URL builder stripped `?jwtToken=` query param → fixed with `new URL()` pathname swap
- React Query cache key collisions between movie/TV sections → scoped keys

---

## Session 3 — Right-click Context Menu + Media Manager
**Date:** 2026-06-06

### Right-click Context Menu
- Custom `onContextMenu` handler on every MediaCard — prevents browser default
- `ContextMenuContext`: tracks `{ item, x, y, visible }` globally
- `ContextMenu` component: frosted-glass panel, appears at cursor, auto-repositions if near viewport edge
- Dismisses on: outside click, Escape key, scroll, navigation
- Menu sections:
  - **Playback**: Play Now · Add to Queue
  - **Library**: Save/Unsave · Mark as Watched · Add Rating (1–10 star picker)
  - **Organize**: Add to Playlist / Create New · Change Artwork
  - **Info**: More Info (navigates to detail page)
- Queue: ordered list, plays next; shown as a shelf or accessible via sidebar
- Ratings: personal 1–10 stored in localStorage, shown as overlay on poster
- Playlists: named lists of items; Create New modal; Add to existing list modal
- Change Artwork: TMDB poster alternatives + custom URL input; override stored per item in localStorage

### New Files (Session 3)
- src/context/ContextMenuContext.jsx
- src/context/QueueContext.jsx
- src/context/RatingsContext.jsx
- src/context/PlaylistContext.jsx
- src/components/ContextMenu.jsx
- src/components/ArtworkPicker.jsx
- src/components/RatingPicker.jsx
- src/components/PlaylistModal.jsx
- src/pages/Queue.jsx
- src/pages/Playlists.jsx
