/**
 * Extract a dominant accent color from an album cover image.
 * Uses a sampled centroid + saturation/lightness filtering so very dark
 * or near-white pixels don't bias the result.
 *
 * Returns CSS color strings ready to plug into custom properties.
 */

const cache = new Map();
const FALLBACK = {
    primary: '#22d3ee',
    secondary: '#6366f1',
    accent: '#a78bfa',
    gradient: 'linear-gradient(135deg, #22d3ee, #6366f1, #a78bfa)'
};

/**
 * Convert RGB (0-255) to HSL (h 0-360, s/l 0-1).
 */
function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            default: h = (r - g) / d + 4;
        }
        h *= 60;
    }
    return [h, s, l];
}

function hslToHex(h, s, l) {
    s = Math.max(0, Math.min(1, s));
    l = Math.max(0, Math.min(1, l));
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => {
        const c = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
        return Math.round(c * 255).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * Returns a Promise<{primary, secondary, accent, gradient}> derived from the image.
 * @param {string} url
 * @returns {Promise<{primary:string, secondary:string, accent:string, gradient:string}>}
 */
export function extractPalette(url) {
    if (!url) return Promise.resolve(FALLBACK);
    if (cache.has(url)) return Promise.resolve(cache.get(url));

    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            try {
                const size = 48; // small sample for speed
                const canvas = document.createElement('canvas');
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                ctx.drawImage(img, 0, 0, size, size);
                const data = ctx.getImageData(0, 0, size, size).data;

                // Histogram in HSL: bin hue 12, sat 3, light 3
                const bins = new Map();
                for (let i = 0; i < data.length; i += 4) {
                    const a = data[i + 3];
                    if (a < 128) continue;
                    const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
                    if (s < 0.18) continue;          // skip greyscale
                    if (l < 0.12 || l > 0.92) continue; // skip near-black/near-white
                    const hb = Math.floor(h / 30);    // 12 hue bins
                    const sb = Math.floor(s * 3);
                    const lb = Math.floor(l * 3);
                    const key = `${hb}|${sb}|${lb}`;
                    const acc = bins.get(key) || { h: 0, s: 0, l: 0, n: 0 };
                    acc.h += h; acc.s += s; acc.l += l; acc.n += 1;
                    bins.set(key, acc);
                }

                if (bins.size === 0) {
                    cache.set(url, FALLBACK);
                    resolve(FALLBACK);
                    return;
                }

                // Sort bins by count descending
                const entries = [...bins.values()].sort((a, b) => b.n - a.n);
                const top = entries[0];
                const hue = top.h / top.n;
                const sat = Math.min(0.8, Math.max(0.45, top.s / top.n));
                const lit = Math.min(0.65, Math.max(0.45, top.l / top.n));

                const primary = hslToHex(hue, sat, lit);
                const secondary = hslToHex((hue + 30) % 360, sat * 0.9, lit * 0.85);
                const accent = hslToHex((hue + 60) % 360, sat * 0.85, Math.min(0.7, lit * 1.1));

                const palette = {
                    primary,
                    secondary,
                    accent,
                    gradient: `linear-gradient(135deg, ${primary}, ${secondary}, ${accent})`
                };
                cache.set(url, palette);
                resolve(palette);
            } catch {
                resolve(FALLBACK);
            }
        };
        img.onerror = () => resolve(FALLBACK);
        img.src = url;
    });
}

/**
 * Apply the palette to the root document via CSS custom properties.
 * @param {{primary:string, secondary:string, accent:string, gradient:string}} palette
 */
export function applyPaletteToRoot(palette) {
    const root = document.documentElement;
    root.style.setProperty('--dynamic-primary', palette.primary);
    root.style.setProperty('--dynamic-secondary', palette.secondary);
    root.style.setProperty('--dynamic-accent', palette.accent);
    root.style.setProperty('--dynamic-gradient', palette.gradient);
}

/**
 * Reset dynamic palette to the static design tokens.
 */
export function resetPaletteOnRoot() {
    const root = document.documentElement;
    root.style.removeProperty('--dynamic-primary');
    root.style.removeProperty('--dynamic-secondary');
    root.style.removeProperty('--dynamic-accent');
    root.style.removeProperty('--dynamic-gradient');
}
