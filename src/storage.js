/**
 * localStorage helpers with safe try/catch and JSON serialization.
 * Also typed helpers for project-specific lists (recent searches, history, playlists).
 */

export const Storage = {
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
    },
    remove(key) {
        try { localStorage.removeItem(key); } catch {}
    }
};

const RECENT_SEARCHES_KEY = 'recentSearches';
const HISTORY_KEY = 'playHistory';
const PLAYLISTS_KEY = 'playlists';
const RECENT_SEARCHES_LIMIT = 6;
const HISTORY_LIMIT = 20;

/**
 * Add a non-empty term to the front of the recent searches list (de-duped).
 * @param {string} term
 */
export function addRecentSearch(term) {
    const t = (term || '').trim();
    if (!t) return [];
    const existing = (Storage.get(RECENT_SEARCHES_KEY, []) || []).filter(x => x.toLowerCase() !== t.toLowerCase());
    const next = [t, ...existing].slice(0, RECENT_SEARCHES_LIMIT);
    Storage.set(RECENT_SEARCHES_KEY, next);
    return next;
}
export function getRecentSearches() {
    const list = Storage.get(RECENT_SEARCHES_KEY, []);
    return Array.isArray(list) ? list : [];
}
export function clearRecentSearches() { Storage.remove(RECENT_SEARCHES_KEY); }

/**
 * Push a track into the play history with timestamp. De-dupes by id, keeps newest first.
 * @param {object} song
 */
export function pushHistory(song) {
    if (!song || song.id === undefined) return [];
    const list = (Storage.get(HISTORY_KEY, []) || []).filter(s => s && s.id !== song.id);
    const entry = {
        id: song.id,
        titre: song.titre,
        artiste: song.artiste,
        album: song.album || '',
        genre: song.genre || '',
        audio: song.audio || '',
        image: song.image || '',
        imageLarge: song.imageLarge || '',
        duree: song.duree || 0,
        isRemote: !!song.isRemote,
        deezerLink: song.deezerLink || '',
        playedAt: Date.now()
    };
    const next = [entry, ...list].slice(0, HISTORY_LIMIT);
    Storage.set(HISTORY_KEY, next);
    return next;
}
export function getHistory() {
    const list = Storage.get(HISTORY_KEY, []);
    return Array.isArray(list) ? list : [];
}
export function clearHistory() { Storage.remove(HISTORY_KEY); }

/**
 * Playlists CRUD. Each playlist: { id, name, songs: [snapshot], createdAt, updatedAt }
 */
function loadPlaylists() {
    const list = Storage.get(PLAYLISTS_KEY, []);
    return Array.isArray(list) ? list : [];
}
function persistPlaylists(list) { Storage.set(PLAYLISTS_KEY, list); }

export function getPlaylists() { return loadPlaylists(); }

export function createPlaylist(name) {
    const playlists = loadPlaylists();
    const playlist = {
        id: 'pl_' + Date.now() + '_' + Math.floor(Math.random() * 1e6),
        name: (name || 'Untitled').trim().slice(0, 80),
        songs: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
    };
    playlists.unshift(playlist);
    persistPlaylists(playlists);
    return playlist;
}

export function renamePlaylist(id, name) {
    const playlists = loadPlaylists();
    const p = playlists.find(x => x.id === id);
    if (!p) return false;
    p.name = (name || '').trim().slice(0, 80) || p.name;
    p.updatedAt = Date.now();
    persistPlaylists(playlists);
    return true;
}

export function deletePlaylist(id) {
    const playlists = loadPlaylists().filter(p => p.id !== id);
    persistPlaylists(playlists);
}

export function addSongToPlaylist(id, song) {
    const playlists = loadPlaylists();
    const p = playlists.find(x => x.id === id);
    if (!p || !song) return false;
    if (p.songs.some(s => s.id === song.id)) return false; // de-dupe
    p.songs.push({
        id: song.id,
        titre: song.titre,
        artiste: song.artiste,
        album: song.album || '',
        genre: song.genre || '',
        audio: song.audio || '',
        image: song.image || '',
        imageLarge: song.imageLarge || '',
        duree: song.duree || 0,
        isRemote: !!song.isRemote,
        deezerLink: song.deezerLink || ''
    });
    p.updatedAt = Date.now();
    persistPlaylists(playlists);
    return true;
}

export function removeSongFromPlaylist(id, songId) {
    const playlists = loadPlaylists();
    const p = playlists.find(x => x.id === id);
    if (!p) return false;
    p.songs = p.songs.filter(s => s.id !== songId);
    p.updatedAt = Date.now();
    persistPlaylists(playlists);
    return true;
}

/**
 * Clamp a volume value to [0, 1] with sensible default for non-finite input.
 * @param {*} v
 * @returns {number}
 */
export function clampVolume(v) {
    const n = parseFloat(v);
    if (!Number.isFinite(n)) return 0.8;
    return Math.max(0, Math.min(1, n));
}
