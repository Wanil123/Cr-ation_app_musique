# SUSPENDED — Premium Music Player

A modern web-based music player built with Vue 3 (Options API). Features a live audio visualizer,
keyboard shortcuts, Deezer API integration with local fallback, and a polished glassmorphic UI.

> 🇫🇷 Énoncé original du travail synthèse : voir [`CONSIGNES.md`](./CONSIGNES.md).

## ✨ Features

- **SPA navigation** — Home ↔ Player without page refresh
- **Live audio visualizer** — Real-time frequency-bar canvas (Web Audio API)
- **Deezer integration** — Live search across millions of tracks with 30 s previews
- **Local fallback** — 10 royalty-free tracks bundled, used if Deezer is unreachable
- **Smart playback** — Shuffle, repeat-all/one, queue, favorites
- **Persistence** — Volume, favorites, language, last-played track, position
- **Full i18n** — French and English (auto-detected from browser)
- **Accessibility** — Keyboard shortcuts, ARIA labels, focus management, screen-reader live regions
- **Media Session API** — System-level playback controls on supported platforms
- **Responsive** — Phone, tablet, and desktop layouts

## 🚀 Quick start

The app is a pure static SPA — **no build step required**. It does need to be served over HTTP
(ES modules don't load over `file://`).

```bash
# Any static server works. Examples:
python -m http.server 8000
# or
npx http-server -p 8000
# or use VS Code's "Live Server" extension
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

- **Vue 3** — Options API, loaded as ES module from CDN (no bundler)
- **Vanilla CSS** — Custom design tokens, mobile-first responsive, `@media (hover)` for touch UX
- **Font Awesome 6** — Iconography (with SRI integrity)
- **Inter** + **Space Grotesk** — Typography from Google Fonts
- **Web Audio API** — Visualizer with `AnalyserNode`
- **Media Session API** — System notification controls
- **Deezer Public API** — JSONP (no key required); falls back to local JSON when blocked

## 📁 Project structure

```
.
├── index.html              # SPA shell
├── app.js                  # Vue application + visualizer + Deezer service
├── style.css               # Design system and components
├── data/
│   └── chansons.json       # Local song catalog (fallback)
├── audio/                  # Royalty-free MP3s (Pixabay)
├── images/                 # Album art
├── manifest.webmanifest    # PWA descriptor
├── CONSIGNES.md            # Original assignment brief (FR)
├── README.md               # You are here
└── LICENSE                 # MIT
```

## 🌍 Browser support

- Chrome / Edge ≥ 90
- Firefox ≥ 90
- Safari ≥ 15 (iOS 15+)

Older browsers without `backdrop-filter` get a solid background fallback.

## 🔐 Security

- Content-Security-Policy meta header restricting script/style/img/media origins
- Subresource Integrity (SRI) on Font Awesome CDN
- `frame-ancestors 'none'` to prevent clickjacking
- URL scheme validation on all remote audio/image sources
- No analytics, no telemetry, no cookies

## 🎵 Credits

- **Local tracks** — Royalty-free from [Pixabay](https://pixabay.com/music/)
- **Live tracks** — Powered by the [Deezer API](https://developers.deezer.com/)
- **Icons** — [Font Awesome](https://fontawesome.com/)
- **Fonts** — [Inter](https://rsms.me/inter/) & [Space Grotesk](https://fonts.google.com/specimen/Space+Grotesk)

## 📄 License

MIT — see [LICENSE](./LICENSE).
