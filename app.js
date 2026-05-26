/**
 * SUSPENDED — Premium Music Player (entry point)
 *
 * Vue 3 Options API app. Logic split into ES modules in src/.
 * - src/visualizer.js — Web Audio visualizer + audio graph owner
 * - src/equalizer.js  — 3-band BiquadFilter EQ
 * - src/deezer.js     — Deezer public API client (JSONP)
 * - src/lyrics.js     — LRCLIB synced lyrics
 * - src/colors.js     — Dominant-color extraction from album art
 * - src/i18n.js       — Translations + interpolation
 * - src/storage.js    — localStorage helpers + recent searches / history / playlists
 */

import { createApp } from 'https://unpkg.com/vue@3.4.21/dist/vue.esm-browser.prod.js';
import { AudioVisualizer } from './src/visualizer.js';
import { Equalizer, EQ_PRESETS } from './src/equalizer.js';
import { DeezerAPI, isSafeRemoteUrl, deezerMapTrack } from './src/deezer.js';
import { getLyrics, activeLineIndex } from './src/lyrics.js';
import { extractPalette, applyPaletteToRoot, resetPaletteOnRoot } from './src/colors.js';
import { translations, interpolate, detectInitialLang } from './src/i18n.js';
import {
    Storage, clampVolume,
    addRecentSearch, getRecentSearches, clearRecentSearches,
    pushHistory, getHistory, clearHistory,
    getPlaylists, createPlaylist, renamePlaylist, deletePlaylist,
    addSongToPlaylist, removeSongFromPlaylist
} from './src/storage.js';

const visualizer = new AudioVisualizer();
let equalizer = null; // lazy: needs an AudioContext, created when visualizer inits

// Deezer genre seeds for the initial library fetch
const DEEZER_GENRES = [
    { name: 'Rap',     query: 'rap francais 2024' },
    { name: 'Hip-Hop', query: 'hip hop hits 2024' },
    { name: 'Pop',     query: 'pop hits 2024' },
    { name: 'R&B',     query: 'rnb soul 2024' },
    { name: 'Rock',    query: 'rock hits' },
    { name: 'Électro', query: 'electronic dance 2024' }
];

const MOODS = [
    { key: 'moodEnergetic', query: 'energetic upbeat workout',     icon: 'fa-bolt' },
    { key: 'moodCalm',      query: 'calm relaxing instrumental',   icon: 'fa-leaf' },
    { key: 'moodFocus',     query: 'focus study concentration',    icon: 'fa-brain' },
    { key: 'moodParty',     query: 'party dance hits 2024',        icon: 'fa-champagne-glasses' },
    { key: 'moodWorkout',   query: 'workout gym motivation',       icon: 'fa-dumbbell' },
    { key: 'moodChill',     query: 'chill lo-fi beats',            icon: 'fa-mug-hot' }
];

const app = createApp({
    data() {
        return {
            isLoading: true,
            currentPage: 'home',
            currentLang: detectInitialLang(),

            songs: [],
            currentSong: null,
            playbackSource: 'library', // 'library' | 'search' | 'charts' | 'mood' | 'history' | 'playlist'
            usingDeezer: false,
            deezerLoadFailed: false,
            songsLoaded: false,

            currentTime: 0,
            duration: 0,
            volume: clampVolume(Storage.get('volume', 0.8)),
            isPlaying: false,
            isMuted: false,
            previousVolume: 0.8,

            isShuffled: Storage.get('shuffle', false) === true,
            repeatMode: ['none', 'all', 'one'].includes(Storage.get('repeat', 'none'))
                ? Storage.get('repeat', 'none') : 'none',
            likedSongs: Array.isArray(Storage.get('likedSongs', [])) ? Storage.get('likedSongs', []) : [],

            searchTerm: '',
            activeFilter: 'all',
            showFullPlayer: false,
            showQueue: false,
            showShortcuts: false,
            showAbout: false,
            showEqualizer: false,
            showLyrics: false,
            showPlaylistPicker: false,
            playlistPickerSong: null,
            showSearchSuggestions: false,
            seeking: false,
            seekHover: { active: false, time: 0, x: 0 },

            showToast: false,
            toastMessage: '',
            announceMessage: '',

            shuffleHistory: [],
            shuffleIndex: -1,
            showVisualizer: true,

            // Search
            deezerGenres: DEEZER_GENRES,
            moods: MOODS,
            searchResults: [],
            isSearchingDeezer: false,
            recentSearches: getRecentSearches(),

            // History / charts / mood / playlists
            playHistory: getHistory(),
            chartTracks: [],
            moodTracks: [],
            activeMood: null,
            isLoadingCharts: false,
            isLoadingMood: false,
            playlists: getPlaylists(),

            // Lyrics
            lyrics: null,        // { synced, lines }
            lyricsLoading: false,
            lyricsLineIndex: -1,

            // EQ state
            eqState: { bass: 0, mid: 0, treble: 0 },

            // Dynamic palette
            dynamicPalette: null
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
            this.songs.forEach(s => { if (s.genre) genres.add(s.genre); });
            return Array.from(genres).sort();
        },

        activeList() {
            if (this.searchTerm.trim() && this.searchResults.length > 0) return this.searchResults;
            if (this.activeFilter === 'recent') return this.playHistory;
            if (this.activeFilter === 'charts') return this.chartTracks;
            if (this.activeFilter === 'mood' && this.activeMood) return this.moodTracks;
            return this.songs;
        },

        filteredSongs() {
            if (this.activeFilter === 'recent') return this.playHistory;
            if (this.activeFilter === 'charts') return this.chartTracks;
            if (this.activeFilter === 'mood' && this.activeMood) return this.moodTracks;
            if (this.searchTerm.trim() && this.searchResults.length > 0) return this.searchResults;

            let result = this.songs;
            const term = this.searchTerm.trim().toLowerCase();
            if (term) {
                result = result.filter(s =>
                    s.titre.toLowerCase().includes(term) ||
                    s.artiste.toLowerCase().includes(term) ||
                    (s.tags || []).some(tag => tag.toLowerCase().includes(term))
                );
            }
            if (this.activeFilter === 'favorites') {
                result = result.filter(s => this.likedSongs.includes(s.id));
            } else if (this.activeFilter !== 'all' && this.activeFilter !== 'recent' &&
                this.activeFilter !== 'charts' && this.activeFilter !== 'mood' &&
                !this.activeFilter.startsWith('playlist:')) {
                result = result.filter(s => s.genre === this.activeFilter);
            }
            if (this.activeFilter.startsWith && this.activeFilter.startsWith('playlist:')) {
                const id = this.activeFilter.slice('playlist:'.length);
                const p = this.playlists.find(x => x.id === id);
                return p ? p.songs : [];
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

        queueList() {
            const source = this.filteredSongs;
            if (!this.currentSong) return source;
            if (this.isShuffled && this.shuffleHistory.length > 0) {
                return this.shuffleHistory.slice(this.shuffleIndex);
            }
            const idx = source.findIndex(s => s.id === this.currentSong.id);
            if (idx === -1) return source;
            return [...source.slice(idx), ...source.slice(0, idx)];
        },

        canShare() {
            return typeof navigator !== 'undefined' && (!!navigator.share || !!navigator.clipboard);
        },

        currentLyricsLine() {
            if (!this.lyrics || this.lyricsLineIndex < 0) return null;
            return this.lyrics.lines[this.lyricsLineIndex] || null;
        }
    },

    methods: {
        // === Navigation ===
        goToPlayer() { this.currentPage = 'player'; },
        goBack() {
            this.currentPage = 'home';
            this.showFullPlayer = false;
            this.showQueue = false;
            this.showLyrics = false;
            this.showEqualizer = false;
        },

        // === Language ===
        setLanguage(lang) {
            if (lang !== 'fr' && lang !== 'en') return;
            this.currentLang = lang;
            Storage.set('lang', lang);
            document.documentElement.setAttribute('lang', lang);
            this.updateDocumentTitle();
        },

        updateDocumentTitle() {
            document.title = this.currentSong
                ? `${this.currentSong.titre} — ${this.currentSong.artiste} • SUSPENDED`
                : (this.currentLang === 'fr' ? 'SUSPENDED — Lecteur de musique' : 'SUSPENDED — Music Player');
        },

        // === Data loading ===
        async fetchSongs() {
            try {
                const all = [];
                const results = await Promise.allSettled(
                    DEEZER_GENRES.map(async (g) => {
                        try {
                            const tracks = await DeezerAPI.search(g.query, 5);
                            return tracks
                                .filter(t => t.preview && isSafeRemoteUrl(t.preview))
                                .map(t => deezerMapTrack(t, g.name));
                        } catch { return []; }
                    })
                );
                results.forEach(r => { if (r.status === 'fulfilled') all.push(...r.value); });
                if (all.length > 0) {
                    this.songs = all;
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
                const res = await fetch('data/chansons.json');
                if (!res.ok) throw new Error('HTTP ' + res.status);
                const data = await res.json();
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

        async loadCharts() {
            if (!this.usingDeezer || this.chartTracks.length > 0) return;
            this.isLoadingCharts = true;
            try {
                const tracks = await DeezerAPI.chart(20);
                this.chartTracks = tracks
                    .filter(t => t.preview && isSafeRemoteUrl(t.preview))
                    .map(t => deezerMapTrack(t, 'Charts'));
            } catch { /* silent */ }
            this.isLoadingCharts = false;
        },

        async loadMood(mood) {
            if (!this.usingDeezer) return;
            this.activeMood = mood.key;
            this.activeFilter = 'mood';
            this.isLoadingMood = true;
            this.moodTracks = [];
            try {
                const tracks = await DeezerAPI.search(mood.query, 20);
                this.moodTracks = tracks
                    .filter(t => t.preview && isSafeRemoteUrl(t.preview))
                    .map(t => deezerMapTrack(t, this.t(mood.key)));
            } catch { /* silent */ }
            this.isLoadingMood = false;
        },

        selectFilter(filter) {
            this.activeFilter = filter;
            if (filter === 'charts' && this.chartTracks.length === 0) this.loadCharts();
        },

        // === URL helpers ===
        getSongImage(song) {
            if (!song || !song.image) return '';
            if (song.isRemote || song.image.startsWith('http')) return isSafeRemoteUrl(song.image) ? song.image : '';
            return 'images/' + encodeURI(song.image);
        },
        getSongImageLarge(song) {
            if (!song) return '';
            if (song.imageLarge && isSafeRemoteUrl(song.imageLarge)) return song.imageLarge;
            return this.getSongImage(song);
        },
        getSongAudio(song) {
            if (!song || !song.audio) return '';
            if (song.isRemote || song.audio.startsWith('http')) return isSafeRemoteUrl(song.audio) ? song.audio : '';
            return 'audio/' + encodeURI(song.audio);
        },

        // === Search ===
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
                    if (requestId !== this._searchRequestId) return;
                    this.searchResults = tracks
                        .filter(t => t.preview && isSafeRemoteUrl(t.preview))
                        .map(t => deezerMapTrack(t, ''));
                } catch { /* silent */ }
                if (requestId === this._searchRequestId) this.isSearchingDeezer = false;
            }, 400);
        },

        onSearchFocus() { this.showSearchSuggestions = true; },
        onSearchBlur() {
            // Defer to allow click on suggestion to register
            setTimeout(() => { this.showSearchSuggestions = false; }, 150);
        },

        commitSearch() {
            const t = this.searchTerm.trim();
            if (t) { this.recentSearches = addRecentSearch(t); }
            this.showSearchSuggestions = false;
        },

        useSuggestion(term) {
            this.searchTerm = term;
            this.showSearchSuggestions = false;
            this.onSearchInput();
        },

        clearRecent() {
            clearRecentSearches();
            this.recentSearches = [];
        },

        clearSearch() {
            this.searchTerm = '';
            this.searchResults = [];
            this.isSearchingDeezer = false;
            clearTimeout(this._searchDebounceTimer);
            this._searchRequestId = (this._searchRequestId || 0) + 1;
            if (this.playbackSource === 'search') this.playbackSource = 'library';
        },

        // === Playback ===
        async playSong(song) {
            if (!song) return;
            const audio = this.$refs.audio;
            if (!audio) return;

            if (this.currentSong?.id === song.id) { this.togglePlayPause(); return; }

            // Determine playback source from active filter
            if (this.activeFilter === 'recent') this.playbackSource = 'history';
            else if (this.activeFilter === 'charts') this.playbackSource = 'charts';
            else if (this.activeFilter === 'mood') this.playbackSource = 'mood';
            else if (this.activeFilter.startsWith && this.activeFilter.startsWith('playlist:')) this.playbackSource = 'playlist';
            else if (this.searchTerm.trim() && this.searchResults.some(s => s.id === song.id)) this.playbackSource = 'search';
            else this.playbackSource = 'library';

            const playToken = ++this._playToken;

            this.currentSong = song;
            this.currentTime = 0;
            this.duration = 0;

            const src = this.getSongAudio(song);
            if (!src) { this.toast(this.t('errorLoading')); this.isPlaying = false; return; }

            audio.src = src;
            this.applyVolumeToOutput(this.isMuted ? 0 : this.volume);

            // Commit search term to recent searches when user actually plays a result
            if (this.playbackSource === 'search' && this.searchTerm.trim()) {
                this.recentSearches = addRecentSearch(this.searchTerm.trim());
            }

            try {
                await audio.play();
                if (playToken !== this._playToken) return;
                this.isPlaying = true;

                this.tryInitVisualizer();
                if (this.showVisualizer) visualizer.start();

                this.updateMediaSession();
                this.updateDocumentTitle();
                this.announce(this.t('nowPlaying', { title: song.titre, artist: song.artiste }));

                if (this.isShuffled) this.addToShuffleHistory(song);

                // Persist history
                this.playHistory = pushHistory(song);

                // Async: dynamic palette + lyrics
                this.refreshDynamicPalette();
                this.refreshLyrics();
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
            const justInited = !visualizer.connected;
            const ok = visualizer.init(audio, canvas);
            if (!ok) { visualizer.attachCanvas(canvas); return; }
            if (justInited) {
                // Create the EQ now that we have an AudioContext, and insert into graph.
                equalizer = new Equalizer(visualizer.audioContext);
                visualizer.insertChain({ input: equalizer.input, output: equalizer.output });
                this.eqState = equalizer.getState();
            }
            visualizer.setGain(this.isMuted ? 0 : this.volume);
        },

        onAudioError() {
            this.isPlaying = false;
            visualizer.stop();
            this.toast(this.t('errorLoading'));
        },

        playNext() {
            const list = this.filteredSongs;
            if (!list.length) return;
            let nextSong;
            if (this.isShuffled) nextSong = this.getNextShuffleSong();
            else if (!this.currentSong) nextSong = list[0];
            else {
                const idx = list.findIndex(s => s.id === this.currentSong.id);
                nextSong = idx === -1 ? list[0] : list[(idx + 1) % list.length];
            }
            if (nextSong) this.playSong(nextSong);
        },

        playPrevious() {
            const list = this.filteredSongs;
            if (!list.length) return;
            if (this.currentTime > 3 && this.$refs.audio) {
                this.$refs.audio.currentTime = 0;
                this.currentTime = 0;
                return;
            }
            let prevSong;
            if (this.isShuffled && this.shuffleIndex > 0) {
                this.shuffleIndex--;
                prevSong = this.shuffleHistory[this.shuffleIndex];
            } else if (!this.currentSong) prevSong = list[0];
            else {
                const idx = list.findIndex(s => s.id === this.currentSong.id);
                prevSong = idx === -1 ? list[0] : list[(idx - 1 + list.length) % list.length];
            }
            if (prevSong) this.playSong(prevSong);
        },

        songEnded() {
            const audio = this.$refs.audio;
            if (this.repeatMode === 'one' && audio) {
                audio.currentTime = 0;
                audio.play().catch(() => {});
                return;
            }
            if (this.repeatMode === 'all') { this.playNext(); return; }
            if (this.isShuffled) {
                if (this.peekNextShuffleSong()) this.playNext();
                else {
                    this.isPlaying = false;
                    if (audio) audio.currentTime = 0;
                    this.currentTime = 0;
                    visualizer.stop();
                }
                return;
            }
            const list = this.filteredSongs;
            const idx = list.findIndex(s => s.id === this.currentSong?.id);
            if (idx !== -1 && idx < list.length - 1) this.playNext();
            else {
                this.isPlaying = false;
                if (audio) audio.currentTime = 0;
                this.currentTime = 0;
                visualizer.stop();
            }
        },

        // === Shuffle ===
        toggleShuffle() {
            this.isShuffled = !this.isShuffled;
            Storage.set('shuffle', this.isShuffled);
            if (this.isShuffled) { this.initializeShuffleQueue(); this.toast(this.t('shuffleOn')); }
            else { this.shuffleHistory = []; this.shuffleIndex = -1; this.toast(this.t('shuffleOff')); }
        },
        initializeShuffleQueue() {
            const source = this.filteredSongs;
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
            if (this.shuffleHistory.length === 0) { this.initializeShuffleQueue(); return; }
            const idx = this.shuffleHistory.findIndex(s => s.id === song.id);
            if (idx !== -1) this.shuffleIndex = idx;
            else {
                this.shuffleIndex = Math.min(this.shuffleIndex + 1, this.shuffleHistory.length);
                this.shuffleHistory.splice(this.shuffleIndex, 0, song);
            }
        },
        peekNextShuffleSong() {
            const next = this.shuffleIndex + 1;
            return next < this.shuffleHistory.length ? this.shuffleHistory[next] : null;
        },
        getNextShuffleSong() {
            if (this.shuffleHistory.length === 0) {
                this.initializeShuffleQueue();
                return this.shuffleHistory[0] || null;
            }
            const next = this.shuffleIndex + 1;
            if (next >= this.shuffleHistory.length) {
                if (this.repeatMode === 'all') {
                    this.initializeShuffleQueue();
                    return this.shuffleHistory[0];
                }
                return null;
            }
            this.shuffleIndex = next;
            return this.shuffleHistory[next];
        },

        // === Repeat ===
        toggleRepeat() {
            const modes = ['none', 'all', 'one'];
            this.repeatMode = modes[(modes.indexOf(this.repeatMode) + 1) % modes.length];
            Storage.set('repeat', this.repeatMode);
            const map = { none: 'repeatOff', all: 'repeatAll', one: 'repeatOne' };
            this.toast(this.t(map[this.repeatMode]));
        },

        // === Volume ===
        applyVolumeToOutput(value) {
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

        // === Seeking ===
        updateTime() {
            if (!this.seeking && this.$refs.audio) {
                this.currentTime = this.$refs.audio.currentTime;
                this.refreshLyricsLine();
                const now = Date.now();
                if (now - this._lastSaveTime > 5000) {
                    this._lastSaveTime = now;
                    this.saveSession();
                }
            }
        },
        onLoadedMetadata() { if (this.$refs.audio) this.duration = this.$refs.audio.duration; },
        onCanPlay() {},

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
            const newTime = (offsetX / rect.width) * (this.duration || 0);
            this.currentTime = newTime;
            if (this.$refs.audio && Number.isFinite(newTime)) this.$refs.audio.currentTime = newTime;
        },
        handleSeekTouch(event) {
            if (!this.seeking || !this.$refs.progressBar || !event.touches[0]) return;
            const rect = this.$refs.progressBar.getBoundingClientRect();
            if (!rect.width) return;
            const offsetX = Math.max(0, Math.min(event.touches[0].clientX - rect.left, rect.width));
            const newTime = (offsetX / rect.width) * (this.duration || 0);
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
        // Hover tooltip on the seek bar
        onSeekHover(event) {
            if (!this.$refs.progressBar || !this.duration) return;
            const rect = this.$refs.progressBar.getBoundingClientRect();
            if (!rect.width) return;
            const offsetX = Math.max(0, Math.min(event.clientX - rect.left, rect.width));
            this.seekHover = {
                active: true,
                time: (offsetX / rect.width) * this.duration,
                x: offsetX
            };
        },
        onSeekLeave() { this.seekHover.active = false; },

        // === Favorites ===
        toggleLike(songId) {
            const idx = this.likedSongs.indexOf(songId);
            if (idx === -1) { this.likedSongs.push(songId); this.toast(this.t('addedToFavorites')); }
            else { this.likedSongs.splice(idx, 1); this.toast(this.t('removedFromFavorites')); }
            Storage.set('likedSongs', this.likedSongs);
        },

        // === Share ===
        async shareCurrent() {
            if (!this.currentSong) return;
            const title = this.currentSong.titre;
            const artist = this.currentSong.artiste;
            const url = this.currentSong.deezerLink || window.location.href;
            const text = `${title} — ${artist}`;
            if (navigator.share) {
                try { await navigator.share({ title, text, url }); return; } catch {}
            }
            if (navigator.clipboard) {
                try { await navigator.clipboard.writeText(url); this.toast(this.t('sharedToClipboard')); } catch {}
            }
        },

        // === Equalizer ===
        toggleEqualizer() { this.showEqualizer = !this.showEqualizer; },
        adjustEQ(band, event) {
            const dB = parseFloat(event.target.value);
            if (!equalizer) return;
            equalizer.setBandGain(band, dB);
            this.eqState = equalizer.getState();
            Storage.set('eq', this.eqState);
        },
        applyEQPreset(name) {
            if (!equalizer) return;
            equalizer.setPreset(name);
            this.eqState = equalizer.getState();
            Storage.set('eq', this.eqState);
        },
        resetEQ() {
            if (!equalizer) return;
            equalizer.reset();
            this.eqState = equalizer.getState();
            Storage.set('eq', this.eqState);
        },

        // === Lyrics ===
        toggleLyrics() {
            this.showLyrics = !this.showLyrics;
            if (this.showLyrics && !this.lyrics && this.currentSong) this.refreshLyrics();
        },
        async refreshLyrics() {
            if (!this.currentSong) { this.lyrics = null; this.lyricsLineIndex = -1; return; }
            this.lyrics = null;
            this.lyricsLineIndex = -1;
            // Abort any in-flight fetch
            if (this._lyricsAbort) this._lyricsAbort.abort();
            const controller = new AbortController();
            this._lyricsAbort = controller;
            this.lyricsLoading = true;
            try {
                const data = await getLyrics(this.currentSong.artiste, this.currentSong.titre, controller.signal);
                this.lyrics = data;
                this.lyricsLineIndex = -1;
            } catch (err) {
                if (err.name !== 'AbortError') this.lyrics = null;
            } finally {
                this.lyricsLoading = false;
            }
        },
        refreshLyricsLine() {
            if (!this.lyrics || !this.lyrics.synced) return;
            this.lyricsLineIndex = activeLineIndex(this.lyrics.lines, this.currentTime);
        },

        // === Dynamic palette ===
        async refreshDynamicPalette() {
            if (!this.currentSong) {
                this.dynamicPalette = null;
                resetPaletteOnRoot();
                return;
            }
            const url = this.getSongImageLarge(this.currentSong);
            if (!url) { this.dynamicPalette = null; resetPaletteOnRoot(); return; }
            try {
                const palette = await extractPalette(url);
                this.dynamicPalette = palette;
                applyPaletteToRoot(palette);
            } catch {
                this.dynamicPalette = null;
                resetPaletteOnRoot();
            }
        },

        // === Playlists ===
        openPlaylistPicker(song) {
            this.playlistPickerSong = song;
            this.showPlaylistPicker = true;
        },
        closePlaylistPicker() {
            this.showPlaylistPicker = false;
            this.playlistPickerSong = null;
        },
        promptCreatePlaylist() {
            const name = window.prompt(this.t('playlistName'));
            if (!name || !name.trim()) return;
            createPlaylist(name.trim());
            this.playlists = getPlaylists();
            this.toast(this.t('playlistCreated'));
        },
        addCurrentToPlaylist(playlistId) {
            const song = this.playlistPickerSong || this.currentSong;
            if (!song) return;
            addSongToPlaylist(playlistId, song);
            this.playlists = getPlaylists();
            this.toast(this.t('addedToPlaylist'));
            this.closePlaylistPicker();
        },
        removeFromPlaylist(playlistId, songId) {
            removeSongFromPlaylist(playlistId, songId);
            this.playlists = getPlaylists();
        },
        deletePlaylistById(id) {
            deletePlaylist(id);
            this.playlists = getPlaylists();
            if (this.activeFilter === 'playlist:' + id) this.activeFilter = 'all';
            this.toast(this.t('playlistDeleted'));
        },
        clearPlayHistory() {
            clearHistory();
            this.playHistory = [];
        },

        // === Utilities ===
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
            this.announceMessage = '';
            this.$nextTick(() => { this.announceMessage = message; });
        },

        // === Media Session ===
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
            } catch {}
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
                    if (this.$refs.audio && d.seekTime !== undefined) this.$refs.audio.currentTime = d.seekTime;
                });
                navigator.mediaSession.setActionHandler('seekbackward', () => this.seekByKeyboard(-10));
                navigator.mediaSession.setActionHandler('seekforward', () => this.seekByKeyboard(10));
            } catch {}
        },

        // === Keyboard ===
        handleKeyboard(event) {
            const target = event.target;
            if (event.isComposing) return;
            if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' ||
                target.tagName === 'SELECT' || target.isContentEditable)) return;

            switch (event.code) {
                case 'Space': event.preventDefault(); if (this.currentSong) this.togglePlayPause(); break;
                case 'ArrowRight': event.preventDefault();
                    if (event.shiftKey) this.playNext(); else this.seekByKeyboard(10); break;
                case 'ArrowLeft': event.preventDefault();
                    if (event.shiftKey) this.playPrevious(); else this.seekByKeyboard(-10); break;
                case 'ArrowUp': event.preventDefault();
                    this.volume = clampVolume(this.volume + 0.05);
                    this.applyVolumeToOutput(this.volume);
                    if (this.volume > 0) { this.isMuted = false; this.previousVolume = this.volume; }
                    Storage.set('volume', this.volume); break;
                case 'ArrowDown': event.preventDefault();
                    this.volume = clampVolume(this.volume - 0.05);
                    this.applyVolumeToOutput(this.volume);
                    this.isMuted = this.volume === 0;
                    Storage.set('volume', this.volume); break;
                case 'KeyM': this.toggleMute(); break;
                case 'KeyS': this.toggleShuffle(); break;
                case 'KeyR': this.toggleRepeat(); break;
                case 'KeyL': if (this.currentSong) this.toggleLike(this.currentSong.id); break;
                case 'KeyF': if (this.currentSong) this.showFullPlayer = !this.showFullPlayer; break;
                case 'Slash':
                    if (event.shiftKey) { event.preventDefault(); this.showShortcuts = !this.showShortcuts; }
                    break;
                case 'Escape':
                    if (this.showPlaylistPicker) this.showPlaylistPicker = false;
                    else if (this.showShortcuts) this.showShortcuts = false;
                    else if (this.showAbout) this.showAbout = false;
                    else if (this.showLyrics) this.showLyrics = false;
                    else if (this.showEqualizer) this.showEqualizer = false;
                    else if (this.showQueue) this.showQueue = false;
                    else if (this.showFullPlayer) this.showFullPlayer = false;
                    break;
            }
        },

        // === Effects ===
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

        // === Session ===
        restoreLastSession() {
            const lastSongId = Storage.get('lastSongId');
            const lastTime = Storage.get('lastTime', 0);
            if (lastSongId === null || lastSongId === undefined) return;
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
            if (document.visibilityState === 'hidden') this.saveSession();
            else if (document.visibilityState === 'visible') {
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
            } else if (visualizer.isActive) {
                visualizer.stop();
            }
        },
        currentSong(s) {
            this.updateDocumentTitle();
            if (s) this.updateMediaSession();
        }
    },

    created() {
        this._playToken = 0;
        this._searchRequestId = 0;
        this._searchDebounceTimer = null;
        this._toastTimeout = null;
        this._lastSaveTime = Date.now();
        this._lyricsAbort = null;
    },

    async mounted() {
        document.documentElement.setAttribute('lang', this.currentLang);
        this.updateDocumentTitle();

        await this.fetchSongs();
        if (this.deezerLoadFailed) this.toast(this.t('deezerUnavailable'));

        this.restoreLastSession();
        if (this.isShuffled && this.songs.length > 0) this.initializeShuffleQueue();

        this.setupMediaSessionHandlers();

        document.addEventListener('keydown', this.handleKeyboard);
        document.addEventListener('visibilitychange', this.onVisibilityChange);
        window.addEventListener('beforeunload', this.saveSession);
        window.addEventListener('pagehide', this.saveSession);

        // Register service worker (non-blocking)
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js').catch(() => {});
        }

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
        if (this._lyricsAbort) this._lyricsAbort.abort();
        visualizer.destroy();
    }
});

app.mount('#app');
