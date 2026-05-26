/**
 * 3-band parametric equalizer built from BiquadFilterNode.
 *
 * Inserts a low-shelf, peaking-mid, and high-shelf in series.
 * Exposes .input and .output to be inserted into the audio graph.
 */

const BAND_CONFIG = [
    { type: 'lowshelf',  frequency: 200,  Q: 1 },
    { type: 'peaking',   frequency: 1000, Q: 1 },
    { type: 'highshelf', frequency: 5000, Q: 1 }
];

const PRESETS = {
    flat:       { bass: 0, mid: 0, treble: 0 },
    bassBoost:  { bass: 6, mid: 0, treble: 0 },
    vocalBoost: { bass: -2, mid: 4, treble: 1 },
    treble:     { bass: 0, mid: 1, treble: 5 },
    loFi:       { bass: 3, mid: -2, treble: -4 }
};

export class Equalizer {
    /**
     * @param {AudioContext} ctx
     */
    constructor(ctx) {
        this.ctx = ctx;
        this.bands = BAND_CONFIG.map(cfg => {
            const f = ctx.createBiquadFilter();
            f.type = cfg.type;
            f.frequency.value = cfg.frequency;
            f.Q.value = cfg.Q;
            f.gain.value = 0;
            return f;
        });
        // Chain bands in series
        for (let i = 0; i < this.bands.length - 1; i++) {
            this.bands[i].connect(this.bands[i + 1]);
        }
        this.input = this.bands[0];
        this.output = this.bands[this.bands.length - 1];
    }

    /**
     * Set gain (dB) for a band index (0=bass, 1=mid, 2=treble). Clamped to [-12, 12].
     * @param {number} index
     * @param {number} dB
     */
    setBandGain(index, dB) {
        if (index < 0 || index >= this.bands.length) return;
        const v = Math.max(-12, Math.min(12, Number(dB) || 0));
        const t = this.ctx.currentTime;
        this.bands[index].gain.cancelScheduledValues(t);
        this.bands[index].gain.setTargetAtTime(v, t, 0.01);
    }

    /**
     * Apply a preset: 'flat', 'bassBoost', 'vocalBoost', 'treble', 'loFi'.
     * @param {string} name
     */
    setPreset(name) {
        const p = PRESETS[name] || PRESETS.flat;
        this.setBandGain(0, p.bass);
        this.setBandGain(1, p.mid);
        this.setBandGain(2, p.treble);
    }

    /** @returns {{bass:number, mid:number, treble:number}} */
    getState() {
        return {
            bass: this.bands[0].gain.value,
            mid: this.bands[1].gain.value,
            treble: this.bands[2].gain.value
        };
    }

    reset() {
        this.setBandGain(0, 0);
        this.setBandGain(1, 0);
        this.setBandGain(2, 0);
    }
}

export { PRESETS as EQ_PRESETS };
