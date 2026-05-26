/**
 * Deezer public API client. Uses JSONP for cross-origin (no API key required).
 * URL origin is validated to mitigate misuse.
 */

const DEEZER_HOST = 'https://api.deezer.com';

/**
 * Returns true if the URL is a safe remote URL (HTTPS, Deezer or its CDN).
 * @param {string} u
 * @returns {boolean}
 */
export function isSafeRemoteUrl(u) {
    if (!u) return false;
    try {
        const x = new URL(u);
        if (x.protocol !== 'https:') return false;
        return x.hostname.endsWith('.dzcdn.net') ||
            x.hostname.endsWith('.deezer.com');
    } catch { return false; }
}

/**
 * Inject a Deezer JSONP request. URL must start with the Deezer API host.
 * @param {string} url
 * @returns {Promise<any>}
 */
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

/**
 * Map a Deezer track API object to the internal song schema used by the app.
 * IDs are namespaced with 'dz_' to avoid colliding with local catalog ids.
 * @param {object} track
 * @param {string} [genre]
 * @returns {object}
 */
export function mapTrack(track, genre = '') {
    const audio = isSafeRemoteUrl(track.preview) ? track.preview : '';
    const image = isSafeRemoteUrl(track.album?.cover_medium) ? track.album.cover_medium : '';
    const imageLarge = isSafeRemoteUrl(track.album?.cover_big) ? track.album.cover_big : '';
    return {
        id: 'dz_' + track.id,
        titre: track.title_short || track.title,
        artiste: track.artist?.name || 'Unknown',
        album: track.album?.title || '',
        genre,
        audio,
        image,
        imageLarge,
        duree: track.duration || 30,
        tags: genre ? [genre] : [],
        isRemote: true,
        deezerLink: track.link || '',
        artistId: track.artist?.id || null
    };
}

export const DeezerAPI = {
    /** @param {string} query @param {number} [limit] */
    async search(query, limit = 8) {
        const url = `${DEEZER_HOST}/search?q=${encodeURIComponent(query)}&limit=${limit}`;
        const data = await deezerJsonp(url);
        return data.data || [];
    },
    /** @param {number} [limit] */
    async chart(limit = 20) {
        const url = `${DEEZER_HOST}/chart/0/tracks?limit=${limit}`;
        const data = await deezerJsonp(url);
        return data.data || [];
    },
    /** @param {number} artistId @param {number} [limit] */
    async artistTop(artistId, limit = 10) {
        const url = `${DEEZER_HOST}/artist/${artistId}/top?limit=${limit}`;
        const data = await deezerJsonp(url);
        return data.data || [];
    }
};

export { mapTrack as deezerMapTrack };
