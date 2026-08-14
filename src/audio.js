// Every sound is synthesised at runtime. No audio files to ship, license or
// load, and the pitch of each cue can track game state — tub clicks walk up a
// pentatonic scale, so working through a palette sounds like a phrase.

const NOISE_SECONDS = 1;

export class Sfx {
  constructor({ enabled = true, volume = 0.7 } = {}) {
    this.enabled = enabled;
    this.volume = volume;
    this.ctx = null;
    this.master = null;
    this.noise = null;
  }

  /** Browsers only allow an AudioContext after a gesture, so build it lazily. */
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    }
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return false;

    this.ctx = new Ctor();
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 9;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;

    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(comp).connect(this.ctx.destination);

    const len = Math.floor(this.ctx.sampleRate * NOISE_SECONDS);
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    return true;
  }

  setEnabled(on) {
    this.enabled = on;
    if (on) this.ensure();
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  get t() {
    return this.ctx.currentTime;
  }

  /* --------------------------------------------------------------- helpers */

  env(gain, t0, peak, attack, decay) {
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  }

  tone(type, freqFrom, freqTo, t0, dur, peak, { attack = 0.006, glide = 'exp' } = {}) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqFrom, t0);
    if (glide === 'exp') osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqTo), t0 + dur);
    else osc.frequency.linearRampToValueAtTime(freqTo, t0 + dur);
    this.env(gain, t0, peak, attack, dur);
    osc.connect(gain).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.1);
    return osc;
  }

  hiss(t0, dur, peak, filterFrom, filterTo, type = 'lowpass', q = 1) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(filterFrom, t0);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, filterTo), t0 + dur);
    const gain = this.ctx.createGain();
    this.env(gain, t0, peak, 0.008, dur);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.1);
  }

  /* ------------------------------------------------------------------ cues */

  play(name, arg) {
    if (!this.enabled || !this.ensure()) return;
    const t0 = this.t + 0.001;
    switch (name) {
      case 'pick': return this.pick(t0, arg | 0);
      case 'splat': return this.splat(t0);
      case 'suck': return this.suck(t0);
      case 'fill': return this.fill(t0);
      case 'nope': return this.nope(t0);
      case 'achievement': return this.achievement(t0);
      case 'complete': return this.complete(t0);
      default: return undefined;
    }
  }

  // Minor pentatonic, so any order of tub clicks stays consonant.
  pick(t0, index = 0) {
    const scale = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24, 27];
    const semis = scale[index % scale.length] + 12 * Math.floor(index / scale.length);
    const f = 440 * 2 ** (semis / 12);
    this.tone('triangle', f, f, t0, 0.09, 0.22, { attack: 0.002 });
    this.hiss(t0, 0.03, 0.05, 4000, 900, 'bandpass', 2);
  }

  // Wet impact: a broadband smack collapsing into a low thud.
  splat(t0) {
    this.hiss(t0, 0.22, 0.5, 7000, 260, 'lowpass', 0.9);
    this.tone('sine', 150, 42, t0, 0.19, 0.55, { attack: 0.002 });
    this.tone('triangle', 320, 90, t0 + 0.01, 0.11, 0.16, { attack: 0.002 });
  }

  // The slurp: everything sweeps upward and cuts off dead on arrival.
  suck(t0) {
    const dur = 0.34;
    this.tone('sawtooth', 110, 720, t0, dur, 0.1, { attack: 0.05 });
    this.hiss(t0, dur, 0.28, 320, 5200, 'bandpass', 5);
    this.tone('sine', 220, 1180, t0 + 0.04, dur - 0.04, 0.09, { attack: 0.08 });
  }

  // The payoff bloop.
  fill(t0) {
    this.tone('sine', 820, 250, t0, 0.16, 0.42, { attack: 0.004 });
    this.tone('triangle', 410, 125, t0, 0.2, 0.16, { attack: 0.004 });
    this.hiss(t0 + 0.005, 0.05, 0.07, 2600, 500, 'lowpass');
  }

  // Wrong colour: dull, short, unmistakably a "no".
  nope(t0) {
    this.tone('sine', 190, 140, t0, 0.1, 0.14, { attack: 0.004, glide: 'lin' });
    this.hiss(t0, 0.05, 0.05, 700, 200, 'lowpass');
  }

  achievement(t0) {
    [0, 4, 7, 12].forEach((semi, i) => {
      const f = 523.25 * 2 ** (semi / 12);
      this.tone('triangle', f, f, t0 + i * 0.055, 0.28, 0.16, { attack: 0.004 });
    });
    this.tone('sine', 2100, 3400, t0 + 0.16, 0.3, 0.05, { attack: 0.05 });
  }

  complete(t0) {
    [0, 4, 7, 11, 14, 19].forEach((semi, i) => {
      const f = 392 * 2 ** (semi / 12);
      this.tone('triangle', f, f, t0 + i * 0.08, 0.5, 0.18, { attack: 0.005 });
      this.tone('sine', f * 2, f * 2, t0 + i * 0.08, 0.35, 0.06, { attack: 0.005 });
    });
  }
}
