/**
 * SUSPENDED - Premium Music Player
 * Vue 3 Application with Modern Features & Audio Visualizer
 */

import { createApp } from 'https://unpkg.com/vue@3.4.21/dist/vue.esm-browser.prod.js';

// ============================================
// Audio Visualizer Engine
// ============================================
class AudioVisualizer {
    constructor() {
        this.audioContext = null;
        this.analyser = null;
        this.source = null;
        this.canvas = null;
        this.ctx = null;
        this.animationId = null;
        this.dataArray = null;
        this.connected = false;
        this.isActive = false;
    }

    init(audioElement, canvas) {
        if (this.connected) return;
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 256;
            this.analyser.smoothingTimeConstant = 0.8;
            this.source = this.audioContext.createMediaElementSource(audioElement);
            this.source.connect(this.analyser);
            this.analyser.connect(this.audioContext.destination);
            this.canvas = canvas;
            this.ctx = canvas.getContext('2d');
            this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
            this.connected = true;
        } catch (e) {
            console.warn('AudioVisualizer init failed:', e);
        }
    }

    resize() {
        if (!this.canvas) return;
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.ctx.scale(dpr, dpr);
    }

    start() {
        if (!this.connected || this.isActive) return;
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
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
            const rect = this.canvas.getBoundingClientRect();
            this.ctx.clearRect(0, 0, rect.width, rect.height);
        }
    }

    draw() {
        if (!this.isActive) return;
        this.animationId = requestAnimationFrame(() => this.draw());

        this.analyser.getByteFrequencyData(this.dataArray);

        const rect = this.canvas.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;

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
            // Cyan → Blue → Violet → Rose gradient matching new palette
            const hue = 185 + (i / barCount) * 145;
            const saturation = 70 + (value / 255) * 20;
            const lightness = 55 + (value / 255) * 20;

            this.ctx.fillStyle = `hsla(${hue}, ${saturation}%, ${lightness}%, ${0.6 + (value / 255) * 0.4})`;

            // Rounded bar tops
            const radius = barWidth / 2;
            const y = height - barHeight;
            this.ctx.beginPath();
            this.ctx.moveTo(x, height);
            this.ctx.lineTo(x, y + radius);
            this.ctx.quadraticCurveTo(x, y, x + radius, y);
            this.ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + radius);
            this.ctx.lineTo(x + barWidth, height);
            this.ctx.fill();

            // Glow effect
            this.ctx.shadowColor = `hsla(${hue}, ${saturation}%, ${lightness}%, 0.5)`;
            this.ctx.shadowBlur = 10;
            this.ctx.fill();
            this.ctx.shadowBlur = 0;
        }
    }

    destroy() {
        this.stop();
        if (this.audioContext) {
            this.audioContext.close().catch(() => {});
        }
        this.connected = false;
    }
}

const visualizer = new AudioVisualizer();

// ============================================
// Deezer API Service (JSONP - no API key needed)
// ============================================
function deezerJsonp(url) {
    return new Promise((resolve, reject) => {
        const cb = 'dz_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
        const script = document.createElement('script');
        const timeout = setTimeout(() => {
            cleanup();
            reject(new Error('Deezer API timeout'));
        }, 10000);

        function cleanup() {
            clearTimeout(timeout);
            delete window[cb];
            if (script.parentNode) script.parentNode.removeChild(script);
        }

        window[cb] = (data) => {
            cleanup();
            resolve(data);
        };

        script.onerror = () => {
            cleanup();
            reject(new Error('Deezer API request failed'));
        };

        const sep = url.includes('?') ? '&' : '?';
        script.src = `${url}${sep}output=jsonp&callback=${cb}`;
        document.head.appendChild(script);
    });
}

const DeezerAPI = {
    baseUrl: 'https://api.deezer.com',

    async search(query, limit = 8) {
        const url = `${this.baseUrl}/search?q=${encodeURIComponent(query)}&limit=${limit}`;
        const data = await deezerJsonp(url);
        return data.data || [];
    },

    async getChart(limit = 10) {
        const url = `${this.baseUrl}/chart/0/tracks?limit=${limit}`;
        const data = await deezerJsonp(url);
        return data.data || [];
    },

    mapTrack(track, genre = '') {
        return {
            id: track.id,
            titre: track.title_short || track.title,
            artiste: track.artist?.name || 'Unknown',
            album: track.album?.title || '',
            genre: genre,
            audio: track.preview || '',
            image: track.album?.cover_medium || '',
            imageLarge: track.album?.cover_big || '',
            duree: track.duration || 30,
            tags: genre ? [genre] : [],
            isRemote: true
        };
    }
};

// ============================================
// Translations / Internationalization
// ============================================
const translations = {
    fr: {
        tagline: 'Votre expérience musicale premium',
        feature1: 'Qualité HD',
        feature2: 'Écoute illimitée',
        feature3: 'Vos favoris',
        startListening: 'Commencer l\'écoute',
        backHome: 'Retour à l\'accueil',
        library: 'Bibliothèque',
        searchPlaceholder: 'Rechercher artistes, titres...',
        all: 'Tout',
        noResults: 'Aucun résultat trouvé',
        playingFrom: 'Lecture depuis',
        queue: 'File d\'attente',
        shuffle: 'Lecture aléatoire',
        previous: 'Précédent',
        play: 'Lecture',
        pause: 'Pause',
        next: 'Suivant',
        repeat: 'Répéter',
        shuffleOn: 'Lecture aléatoire activée',
        shuffleOff: 'Lecture aléatoire désactivée',
        repeatOff: 'Répétition désactivée',
        repeatAll: 'Répéter tout',
        repeatOne: 'Répéter une chanson',
        addedToFavorites: 'Ajouté aux favoris',
        removedFromFavorites: 'Retiré des favoris',
        close: 'Fermer',
        favorites: 'Favoris'
    },
    en: {
        tagline: 'Your premium music experience',
        feature1: 'HD Quality',
        feature2: 'Unlimited listening',
        feature3: 'Your favorites',
        startListening: 'Start listening',
        backHome: 'Back to home',
        library: 'Library',
        searchPlaceholder: 'Search artists, songs...',
        all: 'All',
        noResults: 'No results found',
        playingFrom: 'Playing from',
        queue: 'Queue',
        shuffle: 'Shuffle',
        previous: 'Previous',
        play: 'Play',
        pause: 'Pause',
        next: 'Next',
        repeat: 'Repeat',
        shuffleOn: 'Shuffle enabled',
        shuffleOff: 'Shuffle disabled',
        repeatOff: 'Repeat disabled',
        repeatAll: 'Repeat all',
        repeatOne: 'Repeat one',
        addedToFavorites: 'Added to favorites',
        removedFromFavorites: 'Removed from favorites',
        close: 'Close',
        favorites: 'Favorites'
    }
};

// ============================================
// Local Storage Helpers
// ============================================
const Storage = {
    get(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch {
            return defaultValue;
        }
    },
    set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch {
            console.warn('LocalStorage not available');
        }
    }
};

// ============================================
// Vue Application
// ============================================
const app = createApp({
    data() {
        return {
            // App State
            isLoading: true,
            currentPage: 'home',
            currentLang: Storage.get('lang', 'fr'),

            // Songs Data
            songs: [],
            currentSong: null,
            currentSongIndex: -1,

            // Player State
            currentTime: 0,
            duration: 0,
            volume: Storage.get('volume', 0.8),
            isPlaying: false,
            isMuted: false,
            previousVolume: 0.8,

            // Player Features
            isShuffled: Storage.get('shuffle', false),
            repeatMode: Storage.get('repeat', 'none'), // none, all, one
            likedSongs: Storage.get('likedSongs', []),

            // UI State
            searchTerm: '',
            activeFilter: 'all',
            showFullPlayer: false,
            showQueue: false,
            seeking: false,

            // Toast
            showToast: false,
            toastMessage: '',
            toastTimeout: null,

            // Shuffle history
            shuffleHistory: [],
            shuffleIndex: -1,

            // Visualizer
            showVisualizer: true,

            // Session save throttle
            _lastSaveTime: 0,

            // Skeleton loading
            songsLoaded: false,

            // Floating notes
            floatingNotes: [],

            // Deezer integration
            deezerGenres: [
                { name: 'Rap', query: 'rap francais 2024' },
                { name: 'Hip-Hop', query: 'hip hop hits 2024' },
                { name: 'Pop', query: 'pop hits 2024' },
                { name: 'R&B', query: 'rnb soul 2024' },
                { name: 'Rock', query: 'rock hits' },
                { name: 'Électro', query: 'electronic dance 2024' }
            ],
            searchDebounceTimer: null,
            searchResults: [],
            isSearchingDeezer: false,
            usingDeezer: false
        };
    },

    computed: {
        // Translation function
        t() {
            return (key) => translations[this.currentLang]?.[key] || key;
        },

        // Get unique genres from all songs
        uniqueGenres() {
            const genres = new Set();
            this.songs.forEach(song => {
                if (song.genre) genres.add(song.genre);
            });
            return Array.from(genres).sort();
        },

        // Filtered and sorted songs
        filteredSongs() {
            // If live Deezer search returned results, show those
            if (this.searchTerm.trim() && this.searchResults.length > 0) {
                return this.searchResults;
            }

            let result = [...this.songs];

            // Filter by search term (local filter)
            if (this.searchTerm.trim()) {
                const term = this.searchTerm.toLowerCase().trim();
                result = result.filter(song => {
                    const titleMatch = song.titre.toLowerCase().includes(term);
                    const artistMatch = song.artiste.toLowerCase().includes(term);
                    const tagMatch = song.tags?.some(tag =>
                        tag.toLowerCase().includes(term)
                    );
                    return titleMatch || artistMatch || tagMatch;
                });
            }

            // Filter by favorites
            if (this.activeFilter === 'favorites') {
                result = result.filter(song => this.likedSongs.includes(song.id));
            }
            // Filter by genre
            else if (this.activeFilter !== 'all') {
                result = result.filter(song => song.genre === this.activeFilter);
            }

            return result;
        },

        // Progress percentage for progress bars
        progressPercent() {
            if (!this.duration) return 0;
            return (this.currentTime / this.duration) * 100;
        },

        // Volume icon based on level
        volumeIcon() {
            if (this.isMuted || this.volume === 0) {
                return 'fas fa-volume-xmark';
            } else if (this.volume < 0.3) {
                return 'fas fa-volume-off';
            } else if (this.volume < 0.7) {
                return 'fas fa-volume-low';
            }
            return 'fas fa-volume-high';
        },

        // Queue list (upcoming songs)
        queueList() {
            if (!this.currentSong) return this.filteredSongs;

            if (this.isShuffled && this.shuffleHistory.length > 0) {
                // Show shuffle queue
                return this.shuffleHistory.slice(this.shuffleIndex);
            }

            // Show songs starting from current
            const currentIdx = this.songs.findIndex(s => s.id === this.currentSong.id);
            if (currentIdx === -1) return this.songs;

            return [...this.songs.slice(currentIdx), ...this.songs.slice(0, currentIdx)];
        }
    },

    methods: {
        // ============================================
        // Navigation
        // ============================================
        goToPlayer() {
            this.currentPage = 'player';
        },

        goBack() {
            this.currentPage = 'home';
            this.showFullPlayer = false;
        },

        // ============================================
        // Language
        // ============================================
        setLanguage(lang) {
            this.currentLang = lang;
            Storage.set('lang', lang);
            document.documentElement.lang = lang;
        },

        // ============================================
        // Data Fetching - Deezer API + Local Fallback
        // ============================================
        async fetchSongs() {
            try {
                const allSongs = [];
                const fetchPromises = this.deezerGenres.map(async (genre) => {
                    try {
                        const tracks = await DeezerAPI.search(genre.query, 5);
                        return tracks
                            .filter(t => t.preview) // Only tracks with previews
                            .map(t => DeezerAPI.mapTrack(t, genre.name));
                    } catch (e) {
                        console.warn(`Failed to fetch ${genre.name}:`, e);
                        return [];
                    }
                });

                const results = await Promise.allSettled(fetchPromises);
                results.forEach(result => {
                    if (result.status === 'fulfilled') {
                        allSongs.push(...result.value);
                    }
                });

                if (allSongs.length > 0) {
                    this.songs = allSongs;
                    this.usingDeezer = true;
                } else {
                    await this.fetchLocalSongs();
                }
                this.songsLoaded = true;
            } catch (error) {
                console.error('Deezer fetch failed, falling back to local:', error);
                await this.fetchLocalSongs();
                this.songsLoaded = true;
            }
        },

        async fetchLocalSongs() {
            try {
                const response = await fetch('data/chansons.json');
                if (!response.ok) throw new Error('Failed to fetch local songs');
                this.songs = await response.json();
                this.usingDeezer = false;
            } catch (e) {
                console.error('Local songs fetch also failed:', e);
                this.toast('Error loading songs');
            }
        },

        // URL helpers for remote vs local content
        getSongImage(song) {
            if (!song) return '';
            if (song.isRemote || song.image?.startsWith('http')) return song.image;
            return 'images/' + song.image;
        },

        getSongImageLarge(song) {
            if (!song) return '';
            if (song.imageLarge) return song.imageLarge;
            return this.getSongImage(song);
        },

        getSongAudio(song) {
            if (!song) return '';
            if (song.isRemote || song.audio?.startsWith('http')) return song.audio;
            return 'audio/' + song.audio;
        },

        // Live search via Deezer
        onSearchInput() {
            clearTimeout(this.searchDebounceTimer);
            const term = this.searchTerm.trim();

            if (!term) {
                this.searchResults = [];
                this.isSearchingDeezer = false;
                return;
            }

            // Only search Deezer if we're using Deezer (not local fallback)
            if (!this.usingDeezer) return;

            this.searchDebounceTimer = setTimeout(async () => {
                if (!this.searchTerm.trim()) return;
                this.isSearchingDeezer = true;
                try {
                    const tracks = await DeezerAPI.search(this.searchTerm, 15);
                    if (this.searchTerm.trim()) {
                        this.searchResults = tracks
                            .filter(t => t.preview)
                            .map(t => DeezerAPI.mapTrack(t, ''));
                    }
                } catch (e) {
                    console.warn('Deezer search failed:', e);
                }
                this.isSearchingDeezer = false;
            }, 500);
        },

        // ============================================
        // Playback Controls
        // ============================================
        async playSong(song) {
            if (!song) return;
            const audio = this.$refs.audio;
            if (!audio) return;

            // If clicking the same song, toggle play/pause
            if (this.currentSong?.id === song.id) {
                this.togglePlayPause();
                return;
            }

            // Abort any pending play operation
            if (this.isPlaying) {
                audio.pause();
            }

            this.currentSong = song;
            this.currentSongIndex = this.songs.findIndex(s => s.id === song.id);
            this.currentTime = 0;

            audio.src = this.getSongAudio(song);
            audio.volume = this.isMuted ? 0 : this.volume;

            try {
                await audio.play();
                this.isPlaying = true;

                // Initialize visualizer on first play
                if (!visualizer.connected) {
                    const canvas = this.$refs.visualizerCanvas;
                    if (canvas) {
                        visualizer.init(audio, canvas);
                    }
                }
                if (this.showVisualizer) {
                    visualizer.start();
                }

                // Update Media Session
                this.updateMediaSession();

                // Add to shuffle history if shuffling
                if (this.isShuffled) {
                    this.addToShuffleHistory(song);
                }

                // Spawn floating notes
                this.spawnFloatingNotes();
            } catch (error) {
                // Ignore AbortError from rapid switching
                if (error.name === 'AbortError') return;
                console.error('Playback error:', error);
                if (error.name === 'NotAllowedError') {
                    this.isPlaying = false;
                    this.toast('Click play to start');
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
                    if (!visualizer.connected) {
                        const canvas = this.$refs.visualizerCanvas;
                        if (canvas) visualizer.init(audio, canvas);
                    }
                    if (this.showVisualizer) visualizer.start();
                }
                this.updateMediaSessionState();
            } catch (error) {
                if (error.name === 'AbortError') return;
                console.error('Toggle play error:', error);
            }
        },

        playNext() {
            if (!this.songs.length) return;

            let nextSong;

            if (this.isShuffled) {
                nextSong = this.getNextShuffleSong();
            } else {
                const currentIdx = this.songs.findIndex(s => s.id === this.currentSong?.id);
                const nextIdx = (currentIdx + 1) % this.songs.length;
                nextSong = this.songs[nextIdx];
            }

            if (nextSong) {
                this.playSong(nextSong);
            }
        },

        closeMiniPlayer() {
            // Stop playback and clear current song
            if (this.$refs.audio) {
                this.$refs.audio.pause();
                this.$refs.audio.currentTime = 0;
            }
            this.isPlaying = false;
            this.currentSong = null;
            this.currentTime = 0;
            this.duration = 0;
            visualizer.stop();
        },

        playPrevious() {
            if (!this.songs.length) return;

            // If more than 3 seconds in, restart current song
            if (this.currentTime > 3) {
                this.$refs.audio.currentTime = 0;
                return;
            }

            let prevSong;

            if (this.isShuffled && this.shuffleIndex > 0) {
                this.shuffleIndex--;
                prevSong = this.shuffleHistory[this.shuffleIndex];
            } else {
                const currentIdx = this.songs.findIndex(s => s.id === this.currentSong?.id);
                const prevIdx = (currentIdx - 1 + this.songs.length) % this.songs.length;
                prevSong = this.songs[prevIdx];
            }

            if (prevSong) {
                this.playSong(prevSong);
            }
        },

        songEnded() {
            if (this.repeatMode === 'one') {
                this.$refs.audio.currentTime = 0;
                this.$refs.audio.play().catch(() => {});
                return;
            }

            if (this.repeatMode === 'all') {
                this.playNext();
            } else if (this.isShuffled) {
                // Shuffle ON but repeat not 'all': check if shuffle queue has more songs
                const nextSong = this.peekNextShuffleSong();
                if (nextSong) {
                    this.playNext();
                } else {
                    this.isPlaying = false;
                    visualizer.stop();
                }
            } else {
                // Check if this is the last song
                const currentIdx = this.songs.findIndex(s => s.id === this.currentSong?.id);
                if (currentIdx < this.songs.length - 1) {
                    this.playNext();
                } else {
                    this.isPlaying = false;
                    visualizer.stop();
                }
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
            // Fisher-Yates shuffle
            const shuffled = [...this.songs];
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }

            // Put current song at the start if playing
            if (this.currentSong) {
                const currentIdx = shuffled.findIndex(s => s.id === this.currentSong.id);
                if (currentIdx > 0) {
                    [shuffled[0], shuffled[currentIdx]] = [shuffled[currentIdx], shuffled[0]];
                }
            }

            this.shuffleHistory = shuffled;
            this.shuffleIndex = 0;
        },

        addToShuffleHistory(song) {
            if (this.shuffleHistory.length === 0) {
                this.initializeShuffleQueue();
            }
            // Sync shuffle index to the played song's position
            const idx = this.shuffleHistory.findIndex(s => s.id === song.id);
            if (idx !== -1) {
                this.shuffleIndex = idx;
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
            }

            this.shuffleIndex++;

            if (this.shuffleIndex >= this.shuffleHistory.length) {
                if (this.repeatMode === 'all') {
                    this.initializeShuffleQueue();
                    return this.shuffleHistory[0];
                }
                return null;
            }

            return this.shuffleHistory[this.shuffleIndex];
        },

        // ============================================
        // Repeat
        // ============================================
        toggleRepeat() {
            const modes = ['none', 'all', 'one'];
            const currentIdx = modes.indexOf(this.repeatMode);
            this.repeatMode = modes[(currentIdx + 1) % modes.length];
            Storage.set('repeat', this.repeatMode);

            const messages = {
                none: this.t('repeatOff'),
                all: this.t('repeatAll'),
                one: this.t('repeatOne')
            };
            this.toast(messages[this.repeatMode]);
        },

        // ============================================
        // Volume
        // ============================================
        adjustVolume(event) {
            this.volume = parseFloat(event.target.value);
            Storage.set('volume', this.volume);

            if (this.$refs.audio) {
                this.$refs.audio.volume = this.volume;
            }

            this.isMuted = this.volume === 0;
        },

        toggleMute() {
            const audio = this.$refs.audio;
            if (!audio) return;

            if (this.isMuted) {
                this.volume = this.previousVolume || 0.5;
                audio.volume = this.volume;
                this.isMuted = false;
            } else {
                this.previousVolume = this.volume;
                this.volume = 0;
                audio.volume = 0;
                this.isMuted = true;
            }
        },

        // ============================================
        // Progress / Seeking
        // ============================================
        updateTime() {
            if (!this.seeking && this.$refs.audio) {
                this.currentTime = this.$refs.audio.currentTime;
            }
        },

        onLoadedMetadata() {
            if (this.$refs.audio) {
                this.duration = this.$refs.audio.duration;
            }
        },

        onCanPlay() {
            // Ready to play
        },

        startSeeking(event) {
            this.seeking = true;
            this.handleSeek(event);
            document.addEventListener('mousemove', this.handleSeek);
            document.addEventListener('mouseup', this.stopSeeking);
        },

        startSeekingTouch(event) {
            this.seeking = true;
            this.handleSeekTouch(event);
            document.addEventListener('touchmove', this.handleSeekTouch);
            document.addEventListener('touchend', this.stopSeeking);
        },

        handleSeek(event) {
            if (!this.seeking || !this.$refs.progressBar) return;

            const rect = this.$refs.progressBar.getBoundingClientRect();
            const offsetX = Math.max(0, Math.min(event.clientX - rect.left, rect.width));
            const percent = offsetX / rect.width;
            const newTime = percent * this.duration;

            this.currentTime = newTime;

            if (this.$refs.audio) {
                this.$refs.audio.currentTime = newTime;
            }
        },

        handleSeekTouch(event) {
            if (!this.seeking || !this.$refs.progressBar || !event.touches[0]) return;

            const rect = this.$refs.progressBar.getBoundingClientRect();
            const offsetX = Math.max(0, Math.min(event.touches[0].clientX - rect.left, rect.width));
            const percent = offsetX / rect.width;
            const newTime = percent * this.duration;

            this.currentTime = newTime;

            if (this.$refs.audio) {
                this.$refs.audio.currentTime = newTime;
            }
        },

        stopSeeking() {
            this.seeking = false;
            document.removeEventListener('mousemove', this.handleSeek);
            document.removeEventListener('mouseup', this.stopSeeking);
            document.removeEventListener('touchmove', this.handleSeekTouch);
            document.removeEventListener('touchend', this.stopSeeking);
        },

        // ============================================
        // Favorites
        // ============================================
        toggleLike(songId) {
            const index = this.likedSongs.indexOf(songId);

            if (index === -1) {
                this.likedSongs.push(songId);
                this.toast(this.t('addedToFavorites'));
            } else {
                this.likedSongs.splice(index, 1);
                this.toast(this.t('removedFromFavorites'));
            }

            Storage.set('likedSongs', this.likedSongs);
        },

        // ============================================
        // Utilities
        // ============================================
        formatTime(seconds) {
            if (!seconds || isNaN(seconds)) return '0:00';
            const mins = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return `${mins}:${secs.toString().padStart(2, '0')}`;
        },

        toast(message) {
            this.toastMessage = message;
            this.showToast = true;

            if (this.toastTimeout) {
                clearTimeout(this.toastTimeout);
            }

            this.toastTimeout = setTimeout(() => {
                this.showToast = false;
            }, 2500);
        },

        // ============================================
        // Media Session API (System Controls)
        // ============================================
        updateMediaSession() {
            if (!('mediaSession' in navigator) || !this.currentSong) return;

            navigator.mediaSession.metadata = new MediaMetadata({
                title: this.currentSong.titre,
                artist: this.currentSong.artiste,
                album: this.currentSong.album || 'SUSPENDED',
                artwork: [
                    {
                        src: this.getSongImageLarge(this.currentSong),
                        sizes: '512x512',
                        type: 'image/jpeg'
                    }
                ]
            });
        },

        updateMediaSessionState() {
            if ('mediaSession' in navigator) {
                navigator.mediaSession.playbackState = this.isPlaying ? 'playing' : 'paused';
            }
        },

        setupMediaSessionHandlers() {
            if (!('mediaSession' in navigator)) return;

            navigator.mediaSession.setActionHandler('play', () => {
                this.togglePlayPause();
            });

            navigator.mediaSession.setActionHandler('pause', () => {
                this.togglePlayPause();
            });

            navigator.mediaSession.setActionHandler('previoustrack', () => {
                this.playPrevious();
            });

            navigator.mediaSession.setActionHandler('nexttrack', () => {
                this.playNext();
            });

            navigator.mediaSession.setActionHandler('seekto', (details) => {
                if (this.$refs.audio && details.seekTime !== undefined) {
                    this.$refs.audio.currentTime = details.seekTime;
                }
            });
        },

        // ============================================
        // Keyboard Shortcuts
        // ============================================
        handleKeyboard(event) {
            // Ignore if typing in input
            if (event.target.tagName === 'INPUT') return;

            switch (event.code) {
                case 'Space':
                    event.preventDefault();
                    if (this.currentSong) this.togglePlayPause();
                    break;
                case 'ArrowRight':
                    event.preventDefault();
                    if (event.shiftKey) {
                        this.playNext();
                    } else if (this.$refs.audio) {
                        this.$refs.audio.currentTime = Math.min(
                            this.$refs.audio.currentTime + 10,
                            this.duration
                        );
                    }
                    break;
                case 'ArrowLeft':
                    event.preventDefault();
                    if (event.shiftKey) {
                        this.playPrevious();
                    } else if (this.$refs.audio) {
                        this.$refs.audio.currentTime = Math.max(
                            this.$refs.audio.currentTime - 10,
                            0
                        );
                    }
                    break;
                case 'ArrowUp':
                    event.preventDefault();
                    this.volume = Math.min(this.volume + 0.1, 1);
                    if (this.$refs.audio) this.$refs.audio.volume = this.volume;
                    Storage.set('volume', this.volume);
                    break;
                case 'ArrowDown':
                    event.preventDefault();
                    this.volume = Math.max(this.volume - 0.1, 0);
                    if (this.$refs.audio) this.$refs.audio.volume = this.volume;
                    Storage.set('volume', this.volume);
                    break;
                case 'KeyM':
                    this.toggleMute();
                    break;
                case 'KeyS':
                    this.toggleShuffle();
                    break;
                case 'KeyR':
                    this.toggleRepeat();
                    break;
                case 'KeyL':
                    if (this.currentSong) {
                        this.toggleLike(this.currentSong.id);
                    }
                    break;
                case 'Escape':
                    if (this.showQueue) {
                        this.showQueue = false;
                    } else if (this.showFullPlayer) {
                        this.showFullPlayer = false;
                    }
                    break;
            }
        },

        // ============================================
        // Animations & Visual Effects
        // ============================================
        spawnFloatingNotes() {
            const notes = ['♪', '♫', '♬', '♩', '🎵'];
            for (let i = 0; i < 5; i++) {
                setTimeout(() => {
                    const note = {
                        id: Date.now() + i,
                        symbol: notes[Math.floor(Math.random() * notes.length)],
                        left: 10 + Math.random() * 80,
                        delay: Math.random() * 0.5,
                        duration: 2 + Math.random() * 2
                    };
                    this.floatingNotes.push(note);
                    setTimeout(() => {
                        const idx = this.floatingNotes.findIndex(n => n.id === note.id);
                        if (idx !== -1) this.floatingNotes.splice(idx, 1);
                    }, note.duration * 1000);
                }, i * 200);
            }
        },

        createRipple(event) {
            const button = event.currentTarget;
            const circle = document.createElement('span');
            const diameter = Math.max(button.clientWidth, button.clientHeight);
            const radius = diameter / 2;
            const rect = button.getBoundingClientRect();

            circle.style.width = circle.style.height = `${diameter}px`;
            circle.style.left = `${event.clientX - rect.left - radius}px`;
            circle.style.top = `${event.clientY - rect.top - radius}px`;
            circle.classList.add('ripple-effect');

            const existing = button.querySelector('.ripple-effect');
            if (existing) existing.remove();

            button.appendChild(circle);
            setTimeout(() => circle.remove(), 600);
        },

        // ============================================
        // Restore State
        // ============================================
        restoreLastSession() {
            const lastSongId = Storage.get('lastSongId');
            const lastTime = Storage.get('lastTime', 0);

            if (lastSongId !== null && this.songs.length > 0) {
                const song = this.songs.find(s => s.id === lastSongId);
                if (song) {
                    this.currentSong = song;
                    this.currentSongIndex = this.songs.findIndex(s => s.id === song.id);

                    // Don't auto-play, just set up the track
                    this.$nextTick(() => {
                        if (this.$refs.audio) {
                            this.$refs.audio.src = this.getSongAudio(song);
                            // Wait for metadata before seeking
                            const seekOnLoad = () => {
                                this.$refs.audio.currentTime = lastTime;
                                this.currentTime = lastTime;
                                this.$refs.audio.removeEventListener('loadedmetadata', seekOnLoad);
                            };
                            this.$refs.audio.addEventListener('loadedmetadata', seekOnLoad);
                        }
                    });
                }
            }
        },

        saveSession() {
            if (this.currentSong) {
                Storage.set('lastSongId', this.currentSong.id);
                Storage.set('lastTime', this.currentTime);
            }
        }
    },

    watch: {
        currentTime() {
            // Save progress every 5 seconds (throttled)
            const now = Date.now();
            if (now - this._lastSaveTime > 5000) {
                this._lastSaveTime = now;
                this.saveSession();
            }
        }
    },

    async mounted() {
        // Initialize
        document.documentElement.lang = this.currentLang;

        // Fetch songs
        await this.fetchSongs();

        // Restore session
        this.restoreLastSession();

        // Initialize shuffle if enabled
        if (this.isShuffled && this.songs.length > 0) {
            this.initializeShuffleQueue();
        }

        // Setup Media Session
        this.setupMediaSessionHandlers();

        // Setup keyboard shortcuts
        document.addEventListener('keydown', this.handleKeyboard);

        // Save before unload
        window.addEventListener('beforeunload', this.saveSession);

        // Hide loading screen
        setTimeout(() => {
            this.isLoading = false;
        }, 1000);
    },

    beforeUnmount() {
        document.removeEventListener('keydown', this.handleKeyboard);
        window.removeEventListener('beforeunload', this.saveSession);
        this.saveSession();
        visualizer.destroy();
        this.stopSeeking();
    }
});

app.mount('#app');
