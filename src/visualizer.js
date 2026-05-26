/**
 * Real-time audio visualizer using the Web Audio API.
 * Owns the audio graph: source -> analyser -> [equalizer] -> gain -> destination.
 *
 * The GainNode is exposed because createMediaElementSource bypasses
 * HTMLAudioElement.volume — gain control must happen inside the graph.
 */

export class AudioVisualizer {
    constructor() {
        this.audioContext = null;
        this.analyser = null;
        this.source = null;
        this.gainNode = null;
        this.canvas = null;
        this.ctx = null;
        this.animationId = null;
        this.dataArray = null;
        this.connected = false;
        this.isActive = false;
        this.boundElement = null;
        this._cachedRect = null;
        this._resizeListener = null;
        // External hook for inserting filters (e.g. equalizer) between analyser and gain
        this._insertNode = null;
    }

    /**
     * @param {HTMLAudioElement} audioElement
     * @param {HTMLCanvasElement} canvas
     * @returns {boolean} success
     */
    init(audioElement, canvas) {
        if (this.connected && this.boundElement === audioElement) {
            if (canvas && this.canvas !== canvas) this.attachCanvas(canvas);
            return true;
        }
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 256;
            this.analyser.smoothingTimeConstant = 0.8;
            this.source = this.audioContext.createMediaElementSource(audioElement);
            this.gainNode = this.audioContext.createGain();
            this.gainNode.gain.value = audioElement.volume;

            // Default wiring: source -> analyser -> gain -> destination
            this.source.connect(this.analyser);
            this.analyser.connect(this.gainNode);
            this.gainNode.connect(this.audioContext.destination);

            if (canvas) this.attachCanvas(canvas);
            this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
            this.connected = true;
            this.boundElement = audioElement;

            this._resizeListener = () => { this._cachedRect = null; this.resize(); };
            window.addEventListener('resize', this._resizeListener);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Insert an external audio node (e.g. EQ chain) between analyser and gain.
     * The node must expose .input and .output AudioNodes.
     * @param {{input: AudioNode, output: AudioNode}} chain
     */
    insertChain(chain) {
        if (!this.connected || !chain) return;
        this.analyser.disconnect();
        this.analyser.connect(chain.input);
        chain.output.connect(this.gainNode);
        this._insertNode = chain;
    }

    attachCanvas(canvas) {
        if (!canvas) return;
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this._cachedRect = null;
    }

    setGain(value) {
        if (!this.gainNode || !this.audioContext) return;
        const t = this.audioContext.currentTime;
        this.gainNode.gain.cancelScheduledValues(t);
        this.gainNode.gain.setTargetAtTime(Math.max(0, Math.min(1, value)), t, 0.01);
    }

    resize() {
        if (!this.canvas || !this.ctx) return;
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
