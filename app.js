import { createApp } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';

const app = createApp({
    data() {
        return {
            currentPage: 'home',
            songs: [],
            currentSong: null,
            currentTime: 0,
            searchTerm: '',
            volume: 1,
            isPlaying: false,
            isMuted: false,
            seeking: false
        };
    },
    computed: {
        filteredSongs() {
            return this.songs
                .filter(song => {
                    const titleMatch = song.titre.toLowerCase().includes(this.searchTerm.toLowerCase());
                    const artistMatch = song.artiste.toLowerCase().includes(this.searchTerm.toLowerCase());
                    return titleMatch || artistMatch;
                })
                .sort((a, b) => (a.id === this.currentSong?.id ? -1 : b.id === this.currentSong?.id ? 1 : 0));
        }
    },
    methods: {
        goToPlayer() {
            this.currentPage = 'player';
        },
        goBack() {
            this.currentPage = 'home';
        },
        fetchSongs() {
            fetch('data/chansons.json')
                .then(response => response.json())
                .then(data => this.songs = data)
                .catch(error => console.error('Error fetching songs:', error));
        },
        playSong(song) {
            this.currentSong = song;
            this.currentTime = 0;
            this.isPlaying = true;
            const audio = this.$refs.audio;
            audio.src = `audio/${song.audio}`;
            audio.play();
            audio.volume = this.volume;
        },
        togglePlayPause() {
            const audio = this.$refs.audio;
            this.isPlaying ? audio.pause() : audio.play();
            this.isPlaying = !this.isPlaying;
        },
        updateTime() {
            if (!this.seeking) {
                this.currentTime = this.$refs.audio.currentTime;
            }
        },
        songEnded() {
            this.isPlaying = false;
        },
        formatTime(seconds) {
            const minutes = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
        },
        adjustVolume(event) {
            this.volume = event.target.value;
            this.$refs.audio.volume = this.volume;
            this.isMuted = this.volume === 0;
        },
        toggleMute() {
            const audio = this.$refs.audio;
            this.isMuted = !this.isMuted;
            audio.volume = this.isMuted ? 0 : this.volume;
        },
        startSeeking(event) {
            this.seeking = true;
            this.seek(event);
        },
        seek(event) {
            if (this.seeking) {
                const progressBar = event.currentTarget;
                const rect = progressBar.getBoundingClientRect();
                const offsetX = event.clientX - rect.left;
                const width = progressBar.clientWidth;
                const duration = this.currentSong.temps;
                this.$refs.audio.currentTime = (offsetX / width) * duration;
                this.currentTime = this.$refs.audio.currentTime;
            }
        },
        stopSeeking() {
            this.seeking = false;
            if (this.isPlaying) {
                this.$refs.audio.play();
            }
        }
    },
    mounted() {
        this.fetchSongs();
        window.addEventListener('mousemove', this.seek);
        window.addEventListener('mouseup', this.stopSeeking);
    },
    beforeUnmount() {
        window.removeEventListener('mousemove', this.seek);
        window.removeEventListener('mouseup', this.stopSeeking);
    }
});

app.mount('#app');
