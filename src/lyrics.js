/**
 * Lyrics service using the LRCLIB public API.
 * https://lrclib.net/docs
 *
 * Returns parsed LRC lines [{ time: seconds, text: string }] for synced display.
 */

const LRCLIB_HOST = 'https://lrclib.net';

/**
 * In-memory cache so we don't hammer LRCLIB on every song re-play.
 * Key: artist|title (lowercased), Value: parsed lines or null (= confirmed not found)
 */
const cache = new Map();

/**
 * Parse standard LRC format into [{ time, text }].
 * Each LRC line looks like:  [00:14.32]Hello world
 * @param {string} lrc
 * @returns {Array<{time:number, text:string}>}
 */
export function parseLRC(lrc) {
    if (!lrc) return [];
    const lines = lrc.split('\n');
    const out = [];
    const re = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\](.*)/;
    for (const line of lines) {
        const m = re.exec(line);
        if (!m) continue;
        const mins = parseInt(m[1], 10);
        const secs = parseInt(m[2], 10);
        const frac = m[3] ? parseInt(m[3].padEnd(3, '0'), 10) / 1000 : 0;
        const text = (m[4] || '').trim();
        if (!text) continue;
        out.push({ time: mins * 60 + secs + frac, text });
    }
    out.sort((a, b) => a.time - b.time);
    return out;
}

/**
 * Fetch synced lyrics for an artist + track. Falls back to plain (unsynced) if needed.
 * @param {string} artist
 * @param {string} track
 * @param {AbortSignal} [signal]
 * @returns {Promise<{synced: boolean, lines: Array<{time:number, text:string}>}|null>}
 */
export async function getLyrics(artist, track, signal) {
    if (!artist || !track) return null;
    const key = (artist + '|' + track).toLowerCase();
    if (cache.has(key)) return cache.get(key);

    const url = `${LRCLIB_HOST}/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(track)}`;
    try {
        const res = await fetch(url, { signal });
        if (!res.ok) {
            cache.set(key, null);
            return null;
        }
        const data = await res.json();
        if (data.syncedLyrics) {
            const lines = parseLRC(data.syncedLyrics);
            const result = { synced: true, lines };
            cache.set(key, result);
            return result;
        }
        if (data.plainLyrics) {
            const lines = data.plainLyrics.split('\n')
                .map(t => t.trim())
                .filter(Boolean)
                .map(text => ({ time: 0, text }));
            const result = { synced: false, lines };
            cache.set(key, result);
            return result;
        }
        cache.set(key, null);
        return null;
    } catch (err) {
        if (err.name === 'AbortError') throw err;
        cache.set(key, null);
        return null;
    }
}

/**
 * Find the index of the active line at the given currentTime.
 * @param {Array<{time:number}>} lines
 * @param {number} currentTime
 * @returns {number} index, or -1 when before first line
 */
export function activeLineIndex(lines, currentTime) {
    if (!lines || !lines.length) return -1;
    let lo = 0, hi = lines.length - 1, result = -1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (lines[mid].time <= currentTime) { result = mid; lo = mid + 1; }
        else hi = mid - 1;
    }
    return result;
}
