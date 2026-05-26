# SUSPENDED — Premium Music Player

A modern web-based music player built with Vue 3 (Options API). Features a live audio visualizer,
3-band equalizer, synced lyrics, keyboard shortcuts, Deezer API integration with local fallback,
playlists, listening history, dynamic album-color theming, and a polished glassmorphic UI.

> 🇫🇷 Énoncé original du travail synthèse : voir [`CONSIGNES.md`](./CONSIGNES.md).

## ✨ Features

### Playback core
- **SPA navigation** — Home ↔ Player without page refresh
- **Smart playback** — Shuffle, repeat-all/one, queue preview, favorites
- **Persistence** — Volume, favorites, language, last-played track, position, EQ settings
- **Media Session API** — System-level playback controls on supported platforms
- **Responsive** — Phone, tablet, and desktop layouts with safe-area insets
- **Web Share API** — Share the current track via system share sheet or clipboard fallback

### Audio engineering
- **Live audio visualizer** — 64-bar frequency canvas (Web Audio API `AnalyserNode`)
- **3-band parametric equalizer** — Low-shelf / peaking-mid / high-shelf `BiquadFilterNode`s with 5 presets (Flat, Bass+, Vocal, Treble+, Lo-Fi)
- **GainNode-based volume** — Volume control routed through the Web Audio graph so mute works correctly even when the visualizer is active

### Discovery & content
- **Deezer integration** — Live search across millions of tracks with 30 s previews
- **Top charts** — Deezer's current top 20 with one click
- **Mood radios** — Energetic / Calm / Focus / Party / Workout / Chill (pre-tuned search queries)
- **Local fallback** — Royalty-free tracks bundled, used automatically if Deezer is unreachable
- **Synced lyrics** — Karaoke-style line-by-line via [LRCLIB](https://lrclib.net/) public API, with click-to-seek and "now playing" line overlay
- **Recent searches** — Last 6 searches surfaced as dropdown suggestions
- **Recently played** — 20-track history with timestamps, clearable

### Personalization
- **Playlists** — Create, populate, delete (localStorage only — no account needed)
- **Favorites** — One-tap heart, dedicated filter, illustrated empty state
- **Dynamic palette** — Dominant color extracted from album art at play time, applied as CSS custom properties for an instantly-themed UI

### Quality & ergonomics
- **Full i18n** — French and English with auto-detection from browser locale; all ARIA labels translated
- **Accessibility** — WCAG AA contrast, keyboard shortcuts modal, focus-visible rings, `role="slider"` progress bar, `aria-pressed` toggles, live region for "now playing" announcements
- **Offline-ready** — Service worker caches the app shell (stale-while-revalidate), images and fonts (cache-first), and falls back gracefully when Deezer/LRCLIB are unreachable
- **PWA** — Web App Manifest with maskable icon; installable on Chrome/Edge desktop and mobile

## 🚀 Quick start

The app is a pure static SPA — **no build step required**. It does need to be served over HTTP
(ES modules don't load over `file://`).

```bash
# Any static server works. Examples:
python -m http.server 8000
# or
npx http-server -p 8000 -c-1
# or use VS Code's "Live Server" extension

# Optional: npm scripts
npm start         # python -m http.server 8000
npm run serve     # npx http-server -p 8000
npm run lint      # ESLint
npm run format    # Prettier
```

Open <http://localhost:8000>.

## 🎹 Keyboard shortcuts

Press `?` inside the app for a quick reference, or:

| Key | Action |
|---|---|
| `Space` | Play / Pause |
| `←` / `→` | Seek −10 s / +10 s |
| `Shift` + `←` / `→` | Previous / Next track |
| `↑` / `↓` | Volume up / down |
| `M` | Mute |
| `S` | Shuffle |
| `R` | Cycle repeat (off → all → one) |
| `L` | Like current song |
| `F` | Toggle full-screen player |
| `Esc` | Close modal / dialog |
| `?` | Show shortcuts |

## 🧱 Tech stack

- **Vue 3** (Options API) — Loaded as ES module from `unpkg.com` (no bundler)
- **Vanilla CSS** — Design tokens, mobile-first responsive, `@media (hover)` for touch UX
- **Web Audio API** — Visualizer + 3-band EQ + GainNode-based volume control
- **Media Session API** — System notification controls
- **Deezer Public API** — JSONP (no key required); falls back to local JSON
- **LRCLIB API** — Public lyrics database with synced LRC format
- **Service Worker** — Stale-while-revalidate for shell, cache-first for assets
- **Font Awesome 6** — Iconography (with SRI integrity)
- **Inter** + **Space Grotesk** — Typography from Google Fonts

## 📁 Project structure

```
.
├── index.html              # SPA shell with full UI
├── app.js                  # Vue application entry point
├── style.css               # Design system + all components
├── sw.js                   # Service worker (offline support)
├── manifest.webmanifest    # PWA descriptor
├── src/
│   ├── visualizer.js       # Web Audio visualizer + graph owner
│   ├── equalizer.js        # 3-band BiquadFilter EQ
│   ├── deezer.js           # Deezer API client (JSONP)
│   ├── lyrics.js           # LRCLIB lyrics service + LRC parser
│   ├── colors.js           # Dominant-color extraction from album art
│   ├── i18n.js             # Translations + interpolation
│   └── storage.js          # localStorage helpers + history/playlists/recent
├── data/
│   └── chansons.json       # Local song catalog (fallback)
├── audio/                  # Royalty-free MP3s
├── images/                 # Album art
├── package.json            # npm metadata + scripts (no runtime deps)
├── .eslintrc.json          # Lint rules
├── .prettierrc.json        # Formatting rules
├── .editorconfig           # Editor consistency
├── CONSIGNES.md            # Original assignment brief (FR)
├── README.md               # You are here
└── LICENSE                 # MIT
```

## 🌍 Browser support

- Chrome / Edge ≥ 90
- Firefox ≥ 90
- Safari ≥ 15 (iOS 15+)

Older browsers without `backdrop-filter` get a solid background fallback via `@supports not`.
Users with `prefers-reduced-motion` get animations and heavy filters disabled automatically.

## 🔐 Security

- Strict **Content-Security-Policy** meta header (`default-src 'self'`, explicit `script-src` / `connect-src` allowlists)
- `frame-ancestors 'none'` to prevent clickjacking
- **Subresource Integrity** (SRI) on Font Awesome CDN
- URL scheme validation on all remote audio/image sources (must be HTTPS + Deezer CDN)
- JSONP URLs validated against the Deezer host before injection
- `referrer-policy: strict-origin-when-cross-origin`
- No `eval` outside Vue's own template compiler (required by the `esm-browser` build)

## 🛡️ Privacy

- **No accounts**, **no tracking**, **no analytics**, **no cookies**, **no ads**
- All personalization (favorites, playlists, history, EQ, language, volume) lives only in your browser's `localStorage`
- The only network requests beyond loading the app go to: Deezer API (track search + previews), LRCLIB (lyrics), Google Fonts, CDNJS (Font Awesome), and Deezer's media CDN (`*.dzcdn.net`)
- Clearing your browser data fully resets the player

## 🎵 Credits

- **Local tracks** — Royalty-free from [Pixabay](https://pixabay.com/music/)
- **Live tracks** — [Deezer API](https://developers.deezer.com/)
- **Lyrics** — [LRCLIB](https://lrclib.net/)
- **Icons** — [Font Awesome](https://fontawesome.com/)
- **Fonts** — [Inter](https://rsms.me/inter/) & [Space Grotesk](https://fonts.google.com/specimen/Space+Grotesk)
- **Framework** — [Vue 3](https://vuejs.org/)

## 📄 License

MIT — see [LICENSE](./LICENSE).
