/**
 * SUSPENDED - Premium Music Player
 * Vue 3 application with Deezer integration, audio visualizer,
 * keyboard shortcuts, full i18n and accessibility support.
 */

import { createApp } from 'https://unpkg.com/vue@3.4.21/dist/vue.esm-browser.prod.js';

// ============================================
// Audio Visualizer Engine
// Bound once per audio element. Safe re-init for the same element.
// ============================================
class AudioVisualizer {
    constructor() {
        this.audioContext = null;
        this.analyser = null;
        this.source = null;
        this.gainNode = null;       // controls volume in Web Audio graph
        this.canvas = null;
        this.ctx = null;
        this.animationId = null;
        this.dataArray = null;
        this.connected = false;
        this.isActive = false;
        this.boundElement = null;
        this._cachedRect = null;
        this._resizeListener = null;
    }

    init(audioElement, canvas) {
        // Reuse existing binding if same audio element
        if (this.connected && this.boundElement === audioElement) {
            if (canvas && this.canvas !== canvas) {
                this.canvas = canvas;
                this.ctx = canvas.getContext('2d');
                this._cachedRect = null;
            }
            return true;
        }
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 256;
            this.analyser.smoothingTimeConstant = 0.8;
            // createMediaElementSource throws if already created for this element.
            this.source = this.audioContext.createMediaElementSource(audioElement);
            // GainNode so volume control still works after audio is routed through Web Audio
            this.gainNode = this.audioContext.createGain();
            this.gainNode.gain.value = audioElement.volume;
            this.source.connect(this.analyser);
            this.analyser.connect(this.gainNode);
            this.gainNode.connect(this.audioContext.destination);
            this.canvas = canvas;
            this.ctx = canvas.getContext('2d');
            this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
            this.connected = true;
            this.boundElement = audioElement;
            this._resizeListener = () => { this._cachedRect = null; this.resize(); };
            window.addEventListener('resize', this._resizeListener);
            return true;
        } catch (e) {
            return false;
        }
    }

    // Controls volume through the Web Audio graph (works after createMediaElementSource)
    setGain(value) {
        if (this.gainNode && this.audioContext) {
            const t = this.audioContext.currentTime;
            // Smooth ramp avoids audible clicks
            this.gainNode.gain.cancelScheduledValues(t);
            this.gainNode.gain.setTargetAtTime(Math.max(0, Math.min(1, value)), t, 0.01);
        }
    }

    attachCanvas(canvas) {
        if (!canvas) return;
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this._cachedRect = null;
    }

    resize() {
        if (!this.canvas) return;
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.ctx.scale(dpr, dpr);
        this._cachedRect = rect;
    }

    async start() {
        if (!this.connected || this.isActive) return;
        if (this.audioContext.state === 'suspended') {
            try { await this.audioContext.resume(); } catch {}
        }
        this.isActive = true;
        this.resize();
        this.draw();
    }

    stop() {
        this.isActive = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        if (this.ctx && this.canvas) {
            const rect = this._cachedRect || this.canvas.getBoundingClientRect();
            this.ctx.clearRect(0, 0, rect.width, rect.height);
        }
    }

    draw() {
        if (!this.isActive || !this.canvas || !this.ctx) return;
        this.animationId = requestAnimationFrame(() => this.draw());

        this.analyser.getByteFrequencyData(this.dataArray);

        const rect = this._cachedRect || this.canvas.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;
        if (!width || !height) return;

        this.ctx.clearRect(0, 0, width, height);

        const bufferLength = this.analyser.frequencyBinCount;
        const barCount = Math.min(64, bufferLength);
        const barWidth = (width / barCount) * 0.7;
        const gap = (width / barCount) * 0.3;

        for (let i = 0; i < barCount; i++) {
            const dataIndex = Math.floor(i * bufferLength / barCount);
            const value = this.dataArray[dataIndex];
            const barHeight = (value / 255) * height * 0.9;

            const x = i * (barWidth + gap);
            const hue = 185 + (i / barCount) * 145;
            const saturation = 70 + (value / 255) * 20;
            const lightness = 55 + (value / 255) * 20;
            const alpha = 0.6 + (value / 255) * 0.4;

            this.ctx.fillStyle = `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha})`;
            this.ctx.shadowColor = `hsla(${hue}, ${saturation}%, ${lightness}%, 0.5)`;
            this.ctx.shadowBlur = 8;

            const radius = barWidth / 2;
            const y = height - barHeight;
            this.ctx.beginPath();
            this.ctx.moveTo(x, height);
            this.ctx.lineTo(x, y + radius);
            this.ctx.quadraticCurveTo(x, y, x + radius, y);
            this.ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + radius);
            this.ctx.lineTo(x + barWidth, height);
            this.ctx.fill();
        }
        this.ctx.shadowBlur = 0;
    }

    destroy() {
        this.stop();
        if (this._resizeListener) {
            window.removeEventListener('resize', this._resizeListener);
            this._resizeListener = null;
        }
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close().catch(() => {});
        }
        this.connected = false;
        this.boundElement = null;
    }
}

const visualizer = new AudioVisualizer();

// ============================================
// Deezer API service (JSONP — public API, no key required)
// Validates URL origin to mitigate misuse.
// ============================================
const DEEZER_HOST = 'https://api.deezer.com';

function deezerJsonp(url) {
    return new Promise((resolve, reject) => {
        if (!url.startsWith(DEEZER_HOST)) {
            reject(new Error('Refusing to call non-Deezer URL'));
            return;
        }
        const cb = 'dz_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
        const script = document.createElement('script');
        const timeout = setTimeout(() => {
            cleanup();
            reject(new Error('Deezer API timeout'));
        }, 10000);

        function cleanup() {
            clearTimeout(timeout);
            try { delete window[cb]; } catch { window[cb] = undefined; }
            if (script.parentNode) script.parentNode.removeChild(script);
        }

        window[cb] = (data) => { cleanup(); resolve(data); };
        script.onerror = () => { cleanup(); reject(new Error('Deezer API request failed')); };

        const sep = url.includes('?') ? '&' : '?';
        script.src = `${url}${sep}output=jsonp&callback=${cb}`;
        document.head.appendChild(script);
    });
}

function isSafeRemoteUrl(u) {
    if (!u) return false;
    try {
        const x = new URL(u);
        if (x.protocol !== 'https:') return false;
        return x.hostname.endsWith('.dzcdn.net') || x.hostname.endsWith('.deezer.com');
    } catch { return false; }
}

const DeezerAPI = {
    async search(query, limit = 8) {
        const url = `${DEEZER_HOST}/search?q=${encodeURIComponent(query)}&limit=${limit}`;
        const data = await deezerJsonp(url);
        return data.data || [];
    },

    mapTrack(track, genre = '') {
        const audio = isSafeRemoteUrl(track.preview) ? track.preview : '';
        const image = isSafeRemoteUrl(track.album?.cover_medium) ? track.album.cover_medium : '';
        const imageLarge = isSafeRemoteUrl(track.album?.cover_big) ? track.album.cover_big : '';
        return {
            id: 'dz_' + track.id, // namespace remote IDs to avoid collisions with local
            titre: track.title_short || track.title,
            artiste: track.artist?.name || 'Unknown',
            album: track.album?.title || '',
            genre: genre,
            audio,
            image,
            imageLarge,
            duree: track.duration || 30,
            tags: genre ? [genre] : [],
            isRemote: true,
            deezerLink: track.link || ''
        };
    }
};

// ============================================
// i18n
// ============================================
const translations = {
    fr: {
        tagline: 'Découvrez, visualisez, vibrez',
        feature1: 'Visualisateur en direct',
        feature2: 'Recherche Deezer',
        feature3: 'Vos favoris',
        startListening: 'Commencer l\'écoute',
        accessPlayer: 'Accéder au lecteur',
        backHome: 'Retour à l\'accueil',
        library: 'Bibliothèque',
        searchPlaceholder: 'Rechercher artistes, titres...',
        searchPlaceholderDeezer: 'Rechercher sur Deezer...',
        searchSongs: 'Rechercher des chansons',
        clearSearch: 'Effacer la recherche',
        all: 'Tout',
        favorites: 'Favoris',
        noResults: 'Aucun résultat trouvé',
        noFavorites: 'Aucun favori. Touchez le cœur sur une chanson pour l\'ajouter.',
        playingFrom: 'Lecture depuis',
        queue: 'À suivre',
        shuffle: 'Lecture aléatoire',
        previous: 'Précédent',
        play: 'Lecture',
        pause: 'Pause',
        next: 'Suivant',
        nextTrack: 'Piste suivante',
        repeat: 'Répéter',
        shuffleOn: 'Lecture aléatoire activée',
        shuffleOff: 'Lecture aléatoire désactivée',
        repeatOff: 'Répétition désactivée',
        repeatAll: 'Répéter tout',
        repeatOne: 'Répéter une fois',
        addToFavorites: 'Ajouter aux favoris',
        removeFromFavorites: 'Retirer des favoris',
        addedToFavorites: 'Ajouté aux favoris',
        removedFromFavorites: 'Retiré des favoris',
        close: 'Fermer',
        closePlayer: 'Fermer le lecteur',
        stopPlayback: 'Arrêter la lecture',
        toggleQueue: 'Afficher la file d\'attente',
        volume: 'Volume',
        mute: 'Couper le son',
        unmute: 'Activer le son',
        seek: 'Position de lecture',
        playSong: 'Lire {title} de {artist}',
        nowPlaying: 'En lecture : {title} de {artist}',
        errorLoading: 'Erreur lors du chargement des chansons',
        clickPlayToStart: 'Cliquez sur lecture pour démarrer',
        deezerUnavailable: 'Catalogue Deezer indisponible — bibliothèque locale affichée',
        retry: 'Réessayer',
        poweredBy: 'Propulsé par',
        previewBadge: 'Aperçu 30s',
        shortcutsHelp: 'Raccourcis clavier',
        skipToContent: 'Aller au contenu principal',
        openPlayer: 'Ouvrir le lecteur plein écran'
    },
    en: {
        tagline: 'Discover, visualize, vibe',
        feature1: 'Live visualizer',
        feature2: 'Deezer search',
        feature3: 'Your favorites',
        startListening: 'Start listening',
        accessPlayer: 'Access player',
        backHome: 'Back to home',
        library: 'Library',
        searchPlaceholder: 'Search artists, songs...',
        searchPlaceholderDeezer: 'Search on Deezer...',
        searchSongs: 'Search songs',
        clearSearch: 'Clear search',
        all: 'All',
        favorites: 'Favorites',
        noResults: 'No results found',
        noFavorites: 'No favorites yet. Tap the heart on any song to add one.',
        playingFrom: 'Playing from',
        queue: 'Up next',
        shuffle: 'Shuffle',
        previous: 'Previous',
        play: 'Play',
        pause: 'Pause',
        next: 'Next',
        nextTrack: 'Next track',
        repeat: 'Repeat',
        shuffleOn: 'Shuffle enabled',
        shuffleOff: 'Shuffle disabled',
        repeatOff: 'Repeat disabled',
        repeatAll: 'Repeat all',
        repeatOne: 'Repeat one',
        addToFavorites: 'Add to favorites',
        removeFromFavorites: 'Remove from favorites',
        addedToFavorites: 'Added to favorites',
        removedFromFavorites: 'Removed from favorites',
        close: 'Close',
        closePlayer: 'Close player',
        stopPlayback: 'Stop playback',
        toggleQueue: 'Toggle queue',
        volume: 'Volume',
        mute: 'Mute',
        unmute: 'Unmute',
        seek: 'Seek position',
        playSong: 'Play {title} by {artist}',
        nowPlaying: 'Now playing: {title} by {artist}',
        errorLoading: 'Error loading songs',
        clickPlayToStart: 'Click play to start',
        deezerUnavailable: 'Deezer catalog unavailable — showing local library',
        retry: 'Retry',
        poweredBy: 'Powered by',
        previewBadge: '30s preview',
        shortcutsHelp: 'Keyboard shortcuts',
        skipToContent: 'Skip to main content',
        openPlayer: 'Open full screen player'
    }
};

function interpolate(str, params) {
    if (!params) return str;
    return str.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? '');
}

// ============================================
// localStorage helpers (safe)
// ============================================
const Storage = {
    get(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(key);
            return item === null ? defaultValue : JSON.parse(item);
        } catch {
            return defaultValue;
        }
    },
    set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch {
            return false;
        }
    }
};

function clampVolume(v) {
    const n = parseFloat(v);
    if (!Number.isFinite(n)) return 0.8;
    return Math.max(0, Math.min(1, n));
}

function detectInitialLang() {
    const stored = Storage.get('lang', null);
    if (stored === 'fr' || stored === 'en') return stored;
    if (typeof navigator !== 'undefined' && navigator.language) {
        return navigator.language.toLowerCase().startsWith('fr') ? 'fr' : 'en';
    }
    return 'fr';
}

// ============================================
// Vue application
// ============================================
const app = createApp({
    data() {
        return {
            // App state
            isLoading: true,
            currentPage: 'home',
            currentLang: detectInitialLang(),

            // Catalog
            songs: [],
            currentSong: null,
            playbackSource: 'library', // 'library' | 'search' — drives next/prev navigation
            usingDeezer: false,
            deezerLoadFailed: false,
            songsLoaded: false,

            // Playback
            currentTime: 0,
            duration: 0,
            volume: clampVolume(Storage.get('volume', 0.8)),
            isPlaying: false,
            isMuted: false,
            previousVolume: 0.8,

            // Features
            isShuffled: Storage.get('shuffle', false) === true,
            repeatMode: ['none', 'all', 'one'].includes(Storage.get('repeat', 'none'))
                ? Storage.get('repeat', 'none') : 'none',
            likedSongs: Array.isArray(Storage.get('likedSongs', [])) ? Storage.get('likedSongs', []) : [],

            // UI state
            searchTerm: '',
            activeFilter: 'all',
            showFullPlayer: false,
            showQueue: false,
            showShortcuts: false,
            seeking: false,

            // Toast
            showToast: false,
            toastMessage: '',

            // Live region for screen readers
            announceMessage: '',

            // Shuffle state
            shuffleHistory: [],
            shuffleIndex: -1,

            // Visualizer toggle
            showVisualizer: true,

            // Floating notes (decorative)
            floatingNotes: [],

            // Deezer
            deezerGenres: [
                { name: 'Rap', query: 'rap francais 2024' },
                { name: 'Hip-Hop', query: 'hip hop hits 2024' },
                { name: 'Pop', query: 'pop hits 2024' },
                { name: 'R&B', query: 'rnb soul 2024' },
                { name: 'Rock', query: 'rock hits' },
                { name: 'Électro', query: 'electronic dance 2024' }
            ],
            searchResults: [],
            isSearchingDeezer: false
        };
    },

    computed: {
        t() {
            return (key, params) => {
                const raw = translations[this.currentLang]?.[key] ?? key;
                return interpolate(raw, params);
            };
        },

        uniqueGenres() {
            const genres = new Set();
            this.songs.forEach(song => { if (song.genre) genres.add(song.genre); });
            return Array.from(genres).sort();
        },

        // Active list driving display + next/prev navigation
        activeList() {
            if (this.searchTerm.trim() && this.searchResults.length > 0) {
                return this.searchResults;
            }
            return this.songs;
        },

        filteredSongs() {
            if (this.searchTerm.trim() && this.searchResults.length > 0) {
                return this.searchResults;
            }

            let result = this.songs;
            const term = this.searchTerm.trim().toLowerCase();
            if (term) {
                result = result.filter(song =>
                    song.titre.toLowerCase().includes(term) ||
                    song.artiste.toLowerCase().includes(term) ||
                    (song.tags || []).some(tag => tag.toLowerCase().includes(term))
                );
            }

            if (this.activeFilter === 'favorites') {
                result = result.filter(song => this.likedSongs.includes(song.id));
            } else if (this.activeFilter !== 'all') {
                result = result.filter(song => song.genre === this.activeFilter);
            }
            return result;
        },

        progressPercent() {
            if (!this.duration) return 0;
            return Math.min(100, Math.max(0, (this.currentTime / this.duration) * 100));
        },

        volumeIcon() {
            if (this.isMuted || this.volume === 0) return 'fas fa-volume-xmark';
            if (this.volume < 0.3) return 'fas fa-volume-off';
            if (this.volume < 0.7) return 'fas fa-volume-low';
            return 'fas fa-volume-high';
        },

        repeatIcon() {
            return this.repeatMode === 'one' ? 'fas fa-repeat' : 'fas fa-repeat';
        },

        queueList() {
            const source = this.playbackSource === 'search' && this.searchResults.length
                ? this.searchResults : this.songs;
            if (!this.currentSong) return source;
            if (this.isShuffled && this.shuffleHistory.length > 0) {
                return this.shuffleHistory.slice(this.shuffleIndex);
            }
            const idx = source.findIndex(s => s.id === this.currentSong.id);
            if (idx === -1) return source;
            return [...source.slice(idx), ...source.slice(0, idx)];
        }
    },

    methods: {
        // ============================================
        // Navigation
        // ============================================
        goToPlayer() { this.currentPage = 'player'; },
        goBack() {
            this.currentPage = 'home';
            this.showFullPlayer = false;
            this.showQueue = false;
        },

        // ============================================
        // Language
        // ============================================
        setLanguage(lang) {
            if (lang !== 'fr' && lang !== 'en') return;
            this.currentLang = lang;
            Storage.set('lang', lang);
            document.documentElement.setAttribute('lang', lang);
            this.updateDocumentTitle();
        },

        updateDocumentTitle() {
            if (this.currentSong) {
                document.title = `${this.currentSong.titre} — ${this.currentSong.artiste} • SUSPENDED`;
            } else {
                document.title = this.currentLang === 'fr'
                    ? 'SUSPENDED — Lecteur de musique'
                    : 'SUSPENDED — Music Player';
            }
        },

        // ============================================
        // Data loading
        // ============================================
        async fetchSongs() {
            try {
                const allSongs = [];
                const fetchPromises = this.deezerGenres.map(async (genre) => {
                    try {
                        const tracks = await DeezerAPI.search(genre.query, 5);
                        return tracks
                            .filter(t => t.preview && isSafeRemoteUrl(t.preview))
                            .map(t => DeezerAPI.mapTrack(t, genre.name));
                    } catch {
                        return [];
                    }
                });
                const results = await Promise.allSettled(fetchPromises);
                results.forEach(r => { if (r.status === 'fulfilled') allSongs.push(...r.value); });

                if (allSongs.length > 0) {
                    this.songs = allSongs;
                    this.usingDeezer = true;
                    this.deezerLoadFailed = false;
                } else {
                    this.deezerLoadFailed = true;
                    await this.fetchLocalSongs();
                }
            } catch {
                this.deezerLoadFailed = true;
                await this.fetchLocalSongs();
            } finally {
                this.songsLoaded = true;
            }
        },

        async fetchLocalSongs() {
            try {
                const response = await fetch('data/chansons.json');
                if (!response.ok) throw new Error('HTTP ' + response.status);
                const data = await response.json();
                this.songs = Array.isArray(data) ? data : [];
                this.usingDeezer = false;
            } catch {
                this.songs = [];
                this.toast(this.t('errorLoading'));
            }
        },

        async retryDeezer() {
            this.songsLoaded = false;
            this.searchResults = [];
            await this.fetchSongs();
        },

        // ============================================
        // URL helpers
        // ============================================
        getSongImage(song) {
            if (!song || !song.image) return '';
            if (song.isRemote || song.image.startsWith('http')) {
                return isSafeRemoteUrl(song.image) ? song.image : '';
            }
            return 'images/' + encodeURI(song.image);
        },

        getSongImageLarge(song) {
            if (!song) return '';
            if (song.imageLarge && isSafeRemoteUrl(song.imageLarge)) return song.imageLarge;
            return this.getSongImage(song);
        },

        getSongAudio(song) {
            if (!song || !song.audio) return '';
            if (song.isRemote || song.audio.startsWith('http')) {
                return isSafeRemoteUrl(song.audio) ? song.audio : '';
            }
            return 'audio/' + encodeURI(song.audio);
        },

        // ============================================
        // Search (live Deezer with token-based race protection)
        // ============================================
        onSearchInput() {
            clearTimeout(this._searchDebounceTimer);
            const term = this.searchTerm.trim();
            if (!term) {
                this.searchResults = [];
                this.isSearchingDeezer = false;
                if (this.playbackSource === 'search') this.playbackSource = 'library';
                return;
            }
            if (!this.usingDeezer) return;

            const requestId = ++this._searchRequestId;
            this._searchDebounceTimer = setTimeout(async () => {
                if (requestId !== this._searchRequestId) return;
                this.isSearchingDeezer = true;
                try {
                    const tracks = await DeezerAPI.search(term, 15);
                    if (requestId !== this._searchRequestId) return; // stale
                    this.searchResults = tracks
                        .filter(t => t.preview && isSafeRemoteUrl(t.preview))
                        .map(t => DeezerAPI.mapTrack(t, ''));
                } catch { /* surfaced via empty results */ }
                if (requestId === this._searchRequestId) {
                    this.isSearchingDeezer = false;
                }
            }, 400);
        },

        clearSearch() {
            this.searchTerm = '';
            this.searchResults = [];
            this.isSearchingDeezer = false;
            clearTimeout(this._searchDebounceTimer);
            this._searchRequestId = (this._searchRequestId || 0) + 1;
            if (this.playbackSource === 'search') this.playbackSource = 'library';
        },

        // ============================================
        // Playback
        // ============================================
        async playSong(song) {
            if (!song) return;
            const audio = this.$refs.audio;
            if (!audio) return;

            // Same song → toggle play/pause
            if (this.currentSong?.id === song.id) {
                this.togglePlayPause();
                return;
            }

            // Mark which list we're playing from (library vs search results)
            this.playbackSource = (this.searchTerm.trim() && this.searchResults.some(s => s.id === song.id))
                ? 'search' : 'library';

            // Track this play attempt to bail on rapid switching
            const playToken = ++this._playToken;

            this.currentSong = song;
            this.currentTime = 0;
            this.duration = 0;

            const src = this.getSongAudio(song);
            if (!src) {
                this.toast(this.t('errorLoading'));
                this.isPlaying = false;
                return;
            }
            audio.src = src;
            this.applyVolumeToOutput(this.isMuted ? 0 : this.volume);

            try {
                await audio.play();
                if (playToken !== this._playToken) return; // stale
                this.isPlaying = true;

                // Initialize visualizer if canvas available (full player open)
                this.tryInitVisualizer();
                if (this.showVisualizer) visualizer.start();

                this.updateMediaSession();
                this.updateDocumentTitle();
                this.announce(this.t('nowPlaying', { title: song.titre, artist: song.artiste }));

                if (this.isShuffled) this.addToShuffleHistory(song);
                this.spawnFloatingNotes();
            } catch (error) {
                if (error.name === 'AbortError') return;
                if (error.name === 'NotAllowedError') {
                    this.isPlaying = false;
                    this.toast(this.t('clickPlayToStart'));
                } else {
                    this.isPlaying = false;
                    this.toast(this.t('errorLoading'));
                }
            }
        },

        async togglePlayPause() {
            const audio = this.$refs.audio;
            if (!audio || !this.currentSong) return;
            try {
                if (this.isPlaying) {
                    audio.pause();
                    this.isPlaying = false;
                    visualizer.stop();
                } else {
                    await audio.play();
                    this.isPlaying = true;
                    this.tryInitVisualizer();
                    if (this.showVisualizer) visualizer.start();
                }
                this.updateMediaSessionState();
            } catch (error) {
                if (error.name === 'AbortError') return;
                this.isPlaying = false;
            }
        },

        tryInitVisualizer() {
            const audio = this.$refs.audio;
            const canvas = this.$refs.visualizerCanvas;
            if (!audio || !canvas) return;
            const ok = visualizer.init(audio, canvas);
            if (!ok) visualizer.attachCanvas(canvas);
            // Sync the gain with the current Vue volume state right after init
            if (ok) visualizer.setGain(this.isMuted ? 0 : this.volume);
        },

        onAudioError() {
            this.isPlaying = false;
            visualizer.stop();
            this.toast(this.t('errorLoading'));
        },

        playNext() {
            const list = this.playbackSource === 'search' && this.searchResults.length
                ? this.searchResults : this.songs;
            if (!list.length) return;

            let nextSong;
            if (this.isShuffled) {
                nextSong = this.getNextShuffleSong();
            } else if (!this.currentSong) {
                nextSong = list[0];
            } else {
                const idx = list.findIndex(s => s.id === this.currentSong.id);
                if (idx === -1) {
                    nextSong = list[0];
                } else {
                    nextSong = list[(idx + 1) % list.length];
                }
            }
            if (nextSong) this.playSong(nextSong);
        },

        playPrevious() {
            const list = this.playbackSource === 'search' && this.searchResults.length
                ? this.searchResults : this.songs;
            if (!list.length) return;

            // > 3s in: restart current
            if (this.currentTime > 3 && this.$refs.audio) {
                this.$refs.audio.currentTime = 0;
                this.currentTime = 0;
                return;
            }

            let prevSong;
            if (this.isShuffled && this.shuffleIndex > 0) {
                this.shuffleIndex--;
                prevSong = this.shuffleHistory[this.shuffleIndex];
            } else if (!this.currentSong) {
                prevSong = list[0];
            } else {
                const idx = list.findIndex(s => s.id === this.currentSong.id);
                if (idx === -1) {
                    prevSong = list[0];
                } else {
                    prevSong = list[(idx - 1 + list.length) % list.length];
                }
            }
            if (prevSong) this.playSong(prevSong);
        },

        closeMiniPlayer() {
            const audio = this.$refs.audio;
            if (audio) {
                audio.pause();
                audio.currentTime = 0;
            }
            this.isPlaying = false;
            this.currentSong = null;
            this.currentTime = 0;
            this.duration = 0;
            this.showFullPlayer = false;
            this.showQueue = false;
            this.shuffleHistory = [];
            this.shuffleIndex = -1;
            visualizer.stop();
            this.updateDocumentTitle();
            // Clear last session so we don't restore a closed track
            Storage.set('lastSongId', null);
        },

        songEnded() {
            const audio = this.$refs.audio;
            if (this.repeatMode === 'one' && audio) {
                audio.currentTime = 0;
                audio.play().catch(() => {});
                return;
            }
            if (this.repeatMode === 'all') {
                this.playNext();
                return;
            }
            if (this.isShuffled) {
                if (this.peekNextShuffleSong()) {
                    this.playNext();
                } else {
                    this.isPlaying = false;
                    if (audio) audio.currentTime = 0;
                    this.currentTime = 0;
                    visualizer.stop();
                }
                return;
            }
            const list = this.playbackSource === 'search' && this.searchResults.length
                ? this.searchResults : this.songs;
            const idx = list.findIndex(s => s.id === this.currentSong?.id);
            if (idx !== -1 && idx < list.length - 1) {
                this.playNext();
            } else {
                this.isPlaying = false;
                if (audio) audio.currentTime = 0;
                this.currentTime = 0;
                visualizer.stop();
            }
        },

        // ============================================
        // Shuffle
        // ============================================
        toggleShuffle() {
            this.isShuffled = !this.isShuffled;
            Storage.set('shuffle', this.isShuffled);
            if (this.isShuffled) {
                this.initializeShuffleQueue();
                this.toast(this.t('shuffleOn'));
            } else {
                this.shuffleHistory = [];
                this.shuffleIndex = -1;
                this.toast(this.t('shuffleOff'));
            }
        },

        initializeShuffleQueue() {
            const source = this.playbackSource === 'search' && this.searchResults.length
                ? this.searchResults : this.songs;
            if (!source.length) return;
            const shuffled = [...source];
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
            if (this.currentSong) {
                const idx = shuffled.findIndex(s => s.id === this.currentSong.id);
                if (idx > 0) [shuffled[0], shuffled[idx]] = [shuffled[idx], shuffled[0]];
            }
            this.shuffleHistory = shuffled;
            this.shuffleIndex = 0;
        },

        addToShuffleHistory(song) {
            if (this.shuffleHistory.length === 0) {
                this.initializeShuffleQueue();
                return;
            }
            const idx = this.shuffleHistory.findIndex(s => s.id === song.id);
            if (idx !== -1) {
                this.shuffleIndex = idx;
            } else {
                // Insert after current index
                this.shuffleIndex = Math.min(this.shuffleIndex + 1, this.shuffleHistory.length);
                this.shuffleHistory.splice(this.shuffleIndex, 0, song);
            }
        },

        peekNextShuffleSong() {
            const nextIdx = this.shuffleIndex + 1;
            if (nextIdx >= this.shuffleHistory.length) return null;
            return this.shuffleHistory[nextIdx];
        },

        getNextShuffleSong() {
            if (this.shuffleHistory.length === 0) {
                this.initializeShuffleQueue();
                if (!this.shuffleHistory.length) return null;
                return this.shuffleHistory[0];
            }
            const nextIdx = this.shuffleIndex + 1;
            if (nextIdx >= this.shuffleHistory.length) {
                if (this.repeatMode === 'all') {
                    this.initializeShuffleQueue();
                    return this.shuffleHistory[0];
                }
                return null;
            }
            this.shuffleIndex = nextIdx;
            return this.shuffleHistory[nextIdx];
        },

        // ============================================
        // Repeat
        // ============================================
        toggleRepeat() {
            const modes = ['none', 'all', 'one'];
            this.repeatMode = modes[(modes.indexOf(this.repeatMode) + 1) % modes.length];
            Storage.set('repeat', this.repeatMode);
            const map = { none: 'repeatOff', all: 'repeatAll', one: 'repeatOne' };
            this.toast(this.t(map[this.repeatMode]));
        },

        // ============================================
        // Volume
        // ============================================
        applyVolumeToOutput(value) {
            // Set both the element volume AND the Web Audio gain.
            // When createMediaElementSource has been called, audio.volume alone
            // is bypassed — the GainNode in the visualizer graph is authoritative.
            const audio = this.$refs.audio;
            if (audio) audio.volume = value;
            visualizer.setGain(value);
        },

        adjustVolume(event) {
            this.volume = clampVolume(event.target.value);
            Storage.set('volume', this.volume);
            this.applyVolumeToOutput(this.volume);
            this.isMuted = this.volume === 0;
            if (this.volume > 0) this.previousVolume = this.volume;
        },

        toggleMute() {
            const audio = this.$refs.audio;
            if (!audio) return;
            if (this.isMuted || this.volume === 0) {
                this.volume = clampVolume(this.previousVolume || 0.5);
                this.applyVolumeToOutput(this.volume);
                this.isMuted = false;
            } else {
                this.previousVolume = this.volume;
                this.volume = 0;
                this.applyVolumeToOutput(0);
                this.isMuted = true;
            }
            Storage.set('volume', this.volume);
        },

        // ============================================
        // Progress / Seeking
        // ============================================
        updateTime() {
            if (!this.seeking && this.$refs.audio) {
                this.currentTime = this.$refs.audio.currentTime;
                // Throttled save (instance prop, not reactive)
                const now = Date.now();
                if (now - this._lastSaveTime > 5000) {
                    this._lastSaveTime = now;
                    this.saveSession();
                }
            }
        },

        onLoadedMetadata() {
            if (this.$refs.audio) this.duration = this.$refs.audio.duration;
        },

        onCanPlay() { /* ready */ },

        startSeeking(event) {
            this.seeking = true;
            this.handleSeek(event);
            document.addEventListener('mousemove', this.handleSeek);
            document.addEventListener('mouseup', this.stopSeeking);
        },

        startSeekingTouch(event) {
            this.seeking = true;
            this.handleSeekTouch(event);
            document.addEventListener('touchmove', this.handleSeekTouch, { passive: true });
            document.addEventListener('touchend', this.stopSeeking);
        },

        handleSeek(event) {
            if (!this.seeking || !this.$refs.progressBar) return;
            const rect = this.$refs.progressBar.getBoundingClientRect();
            if (!rect.width) return;
            const offsetX = Math.max(0, Math.min(event.clientX - rect.left, rect.width));
            const percent = offsetX / rect.width;
            const newTime = percent * (this.duration || 0);
            this.currentTime = newTime;
            if (this.$refs.audio && Number.isFinite(newTime)) this.$refs.audio.currentTime = newTime;
        },

        handleSeekTouch(event) {
            if (!this.seeking || !this.$refs.progressBar || !event.touches[0]) return;
            const rect = this.$refs.progressBar.getBoundingClientRect();
            if (!rect.width) return;
            const offsetX = Math.max(0, Math.min(event.touches[0].clientX - rect.left, rect.width));
            const percent = offsetX / rect.width;
            const newTime = percent * (this.duration || 0);
            this.currentTime = newTime;
            if (this.$refs.audio && Number.isFinite(newTime)) this.$refs.audio.currentTime = newTime;
        },

        stopSeeking() {
            this.seeking = false;
            document.removeEventListener('mousemove', this.handleSeek);
            document.removeEventListener('mouseup', this.stopSeeking);
            document.removeEventListener('touchmove', this.handleSeekTouch);
            document.removeEventListener('touchend', this.stopSeeking);
        },

        seekByKeyboard(deltaSeconds) {
            const audio = this.$refs.audio;
            if (!audio || !this.duration) return;
            const newTime = Math.max(0, Math.min(this.duration, audio.currentTime + deltaSeconds));
            audio.currentTime = newTime;
            this.currentTime = newTime;
        },

        // ============================================
        // Favorites
        // ============================================
        toggleLike(songId) {
            const idx = this.likedSongs.indexOf(songId);
            if (idx === -1) {
                this.likedSongs.push(songId);
                this.toast(this.t('addedToFavorites'));
            } else {
                this.likedSongs.splice(idx, 1);
                this.toast(this.t('removedFromFavorites'));
            }
            Storage.set('likedSongs', this.likedSongs);
        },

        // ============================================
        // Utilities
        // ============================================
        formatTime(seconds) {
            if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
            const mins = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return `${mins}:${secs.toString().padStart(2, '0')}`;
        },

        toast(message) {
            this.toastMessage = message;
            this.showToast = true;
            clearTimeout(this._toastTimeout);
            this._toastTimeout = setTimeout(() => { this.showToast = false; }, 2500);
        },

        announce(message) {
            // Force re-announce by clearing then setting
            this.announceMessage = '';
            this.$nextTick(() => { this.announceMessage = message; });
        },

        // ============================================
        // Media Session
        // ============================================
        updateMediaSession() {
            if (!('mediaSession' in navigator) || !this.currentSong) return;
            const art = this.getSongImageLarge(this.currentSong);
            const artwork = art ? [{ src: art, sizes: '512x512', type: 'image/jpeg' }] : [];
            try {
                navigator.mediaSession.metadata = new MediaMetadata({
                    title: this.currentSong.titre,
                    artist: this.currentSong.artiste,
                    album: this.currentSong.album || 'SUSPENDED',
                    artwork
                });
            } catch { /* ignore */ }
        },

        updateMediaSessionState() {
            if ('mediaSession' in navigator) {
                navigator.mediaSession.playbackState = this.isPlaying ? 'playing' : 'paused';
            }
        },

        setupMediaSessionHandlers() {
            if (!('mediaSession' in navigator)) return;
            try {
                navigator.mediaSession.setActionHandler('play', () => this.togglePlayPause());
                navigator.mediaSession.setActionHandler('pause', () => this.togglePlayPause());
                navigator.mediaSession.setActionHandler('previoustrack', () => this.playPrevious());
                navigator.mediaSession.setActionHandler('nexttrack', () => this.playNext());
                navigator.mediaSession.setActionHandler('seekto', (d) => {
                    if (this.$refs.audio && d.seekTime !== undefined) {
                        this.$refs.audio.currentTime = d.seekTime;
                    }
                });
                navigator.mediaSession.setActionHandler('seekbackward', () => this.seekByKeyboard(-10));
                navigator.mediaSession.setActionHandler('seekforward', () => this.seekByKeyboard(10));
            } catch { /* unsupported actions */ }
        },

        // ============================================
        // Keyboard shortcuts
        // ============================================
        handleKeyboard(event) {
            // Skip if typing in any form field or contenteditable; skip during IME composition
            const target = event.target;
            if (event.isComposing) return;
            if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' ||
                target.tagName === 'SELECT' || target.isContentEditable)) return;

            switch (event.code) {
                case 'Space':
                    event.preventDefault();
                    if (this.currentSong) this.togglePlayPause();
                    break;
                case 'ArrowRight':
                    event.preventDefault();
                    if (event.shiftKey) this.playNext();
                    else this.seekByKeyboard(10);
                    break;
                case 'ArrowLeft':
                    event.preventDefault();
                    if (event.shiftKey) this.playPrevious();
                    else this.seekByKeyboard(-10);
                    break;
                case 'ArrowUp':
                    event.preventDefault();
                    this.volume = clampVolume(this.volume + 0.05);
                    this.applyVolumeToOutput(this.volume);
                    if (this.volume > 0) { this.isMuted = false; this.previousVolume = this.volume; }
                    Storage.set('volume', this.volume);
                    break;
                case 'ArrowDown':
                    event.preventDefault();
                    this.volume = clampVolume(this.volume - 0.05);
                    this.applyVolumeToOutput(this.volume);
                    this.isMuted = this.volume === 0;
                    Storage.set('volume', this.volume);
                    break;
                case 'KeyM': this.toggleMute(); break;
                case 'KeyS': this.toggleShuffle(); break;
                case 'KeyR': this.toggleRepeat(); break;
                case 'KeyL': if (this.currentSong) this.toggleLike(this.currentSong.id); break;
                case 'KeyF': if (this.currentSong) this.showFullPlayer = !this.showFullPlayer; break;
                case 'Slash':
                    if (event.shiftKey) { event.preventDefault(); this.showShortcuts = !this.showShortcuts; }
                    break;
                case 'Escape':
                    if (this.showShortcuts) this.showShortcuts = false;
                    else if (this.showQueue) this.showQueue = false;
                    else if (this.showFullPlayer) this.showFullPlayer = false;
                    break;
            }
        },

        // ============================================
        // Visual effects
        // ============================================
        spawnFloatingNotes() {
            const notes = ['♪', '♫', '♬', '♩', '🎵'];
            const baseId = ++this._noteCounter * 1000;
            for (let i = 0; i < 5; i++) {
                const tid = setTimeout(() => {
                    const note = {
                        id: baseId + i,
                        symbol: notes[Math.floor(Math.random() * notes.length)],
                        left: 10 + Math.random() * 80,
                        delay: Math.random() * 0.5,
                        duration: 2 + Math.random() * 2
                    };
                    this.floatingNotes.push(note);
                    const cleanupId = setTimeout(() => {
                        const idx = this.floatingNotes.findIndex(n => n.id === note.id);
                        if (idx !== -1) this.floatingNotes.splice(idx, 1);
                        this._noteTimers.delete(cleanupId);
                    }, note.duration * 1000);
                    this._noteTimers.add(cleanupId);
                    this._noteTimers.delete(tid);
                }, i * 200);
                this._noteTimers.add(tid);
            }
        },

        createRipple(event) {
            const button = event.currentTarget;
            if (!button) return;
            const circle = document.createElement('span');
            const diameter = Math.max(button.clientWidth, button.clientHeight);
            const radius = diameter / 2;
            const rect = button.getBoundingClientRect();
            circle.style.width = circle.style.height = `${diameter}px`;
            circle.style.left = `${event.clientX - rect.left - radius}px`;
            circle.style.top = `${event.clientY - rect.top - radius}px`;
            circle.classList.add('ripple-effect');
            button.querySelectorAll('.ripple-effect').forEach(el => el.remove());
            button.appendChild(circle);
            setTimeout(() => circle.remove(), 600);
        },

        // ============================================
        // Session persistence
        // ============================================
        restoreLastSession() {
            const lastSongId = Storage.get('lastSongId');
            const lastTime = Storage.get('lastTime', 0);
            if (lastSongId === null || lastSongId === undefined) return;
            // Only restore local tracks (remote IDs are unstable across fetches)
            if (typeof lastSongId === 'string' && lastSongId.startsWith('dz_')) return;

            const song = this.songs.find(s => s.id === lastSongId);
            if (!song) return;
            this.currentSong = song;
            this.$nextTick(() => {
                const audio = this.$refs.audio;
                if (!audio) return;
                audio.src = this.getSongAudio(song);
                const onMeta = () => {
                    audio.currentTime = lastTime;
                    this.currentTime = lastTime;
                    audio.removeEventListener('loadedmetadata', onMeta);
                };
                audio.addEventListener('loadedmetadata', onMeta, { once: true });
                this.updateDocumentTitle();
            });
        },

        saveSession() {
            if (this.currentSong) {
                Storage.set('lastSongId', this.currentSong.id);
                Storage.set('lastTime', this.currentTime);
            }
        },

        onVisibilityChange() {
            if (document.visibilityState === 'hidden') {
                this.saveSession();
            } else if (document.visibilityState === 'visible') {
                if (visualizer.audioContext && visualizer.audioContext.state === 'suspended') {
                    visualizer.audioContext.resume().catch(() => {});
                }
            }
        }
    },

    watch: {
        showFullPlayer(open) {
            if (open) {
                this.$nextTick(() => {
                    this.tryInitVisualizer();
                    if (this.isPlaying && this.showVisualizer) visualizer.start();
                });
            } else {
                // Pause visualizer to save CPU when canvas not visible
                if (visualizer.isActive) visualizer.stop();
            }
        },
        currentSong(s) {
            this.updateDocumentTitle();
            if (s) this.updateMediaSession();
        }
    },

    created() {
        // Non-reactive instance props (not part of data())
        this._playToken = 0;
        this._searchRequestId = 0;
        this._searchDebounceTimer = null;
        this._toastTimeout = null;
        this._lastSaveTime = Date.now();
        this._noteCounter = 0;
        this._noteTimers = new Set();
    },

    async mounted() {
        document.documentElement.setAttribute('lang', this.currentLang);
        this.updateDocumentTitle();

        await this.fetchSongs();

        if (this.deezerLoadFailed) {
            this.toast(this.t('deezerUnavailable'));
        }

        this.restoreLastSession();

        if (this.isShuffled && this.songs.length > 0) {
            this.initializeShuffleQueue();
        }

        this.setupMediaSessionHandlers();

        document.addEventListener('keydown', this.handleKeyboard);
        document.addEventListener('visibilitychange', this.onVisibilityChange);
        window.addEventListener('beforeunload', this.saveSession);
        window.addEventListener('pagehide', this.saveSession);

        // Hide loading shortly after data is ready
        await this.$nextTick();
        setTimeout(() => { this.isLoading = false; }, 300);
    },

    beforeUnmount() {
        document.removeEventListener('keydown', this.handleKeyboard);
        document.removeEventListener('visibilitychange', this.onVisibilityChange);
        window.removeEventListener('beforeunload', this.saveSession);
        window.removeEventListener('pagehide', this.saveSession);
        this.saveSession();
        this.stopSeeking();
        clearTimeout(this._searchDebounceTimer);
        clearTimeout(this._toastTimeout);
        if (this._noteTimers) this._noteTimers.forEach(id => clearTimeout(id));
        visualizer.destroy();
    }
});

app.mount('#app');
