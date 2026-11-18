// Coral Bay — all sound is synthesised with WebAudio: no audio files, so the
// game stays a handful of static text files. The engine and the siren are
// looping oscillators whose pitch follows the action; everything else is a
// short one-shot blip or noise burst. Nothing starts until the player first
// clicks or presses a key, which is when browsers allow audio.

export class SoundBus {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenPhase = 0;
  }

  /** Create the context on the first user gesture; safe to call every frame. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return;
    this.ctx = new AudioCtor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    this.startEngineLoop();
    this.startSirenLoop();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.5, this.ctx.currentTime, 0.03);
    }
  }

  startEngineLoop() {
    const ctx = this.ctx;
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(filter).connect(this.engineGain).connect(this.master);
    this.engineOsc.start();
  }

  startSirenLoop() {
    const ctx = this.ctx;
    this.sirenOsc = ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 700;
    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain).connect(this.master);
    this.sirenOsc.start();
  }

  /** throttle is 0..1; silent when the player is on foot. */
  setEngine(running, throttle) {
    if (!this.ctx || !this.engineGain) return;
    const t = this.ctx.currentTime;
    const gain = running ? 0.05 + throttle * 0.075 : 0;
    this.engineGain.gain.setTargetAtTime(gain, t, 0.09);
    this.engineOsc.frequency.setTargetAtTime(52 + throttle * 118, t, 0.09);
  }

  /** Police nearby and wanted: wail. dt advances the two-tone cycle. */
  setSiren(active, dt) {
    if (!this.ctx || !this.sirenGain) return;
    this.sirenPhase += dt * 2.4;
    const t = this.ctx.currentTime;
    this.sirenGain.gain.setTargetAtTime(active ? 0.028 : 0, t, 0.12);
    if (active) {
      const tone = Math.sin(this.sirenPhase * Math.PI * 2) > 0 ? 880 : 660;
      this.sirenOsc.frequency.setTargetAtTime(tone, t, 0.05);
    }
  }

  tone(freqFrom, freqTo, seconds, type, volume) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqFrom, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqTo), ctx.currentTime + seconds);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + seconds);
    osc.connect(gain).connect(this.master);
    osc.start();
    osc.stop(ctx.currentTime + seconds + 0.02);
  }

  noise(seconds, volume, filterFreq) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.connect(filter).connect(gain).connect(this.master);
    source.start();
  }

  gunshot() {
    this.noise(0.13, 0.5, 2600);
    this.tone(150, 45, 0.1, 'square', 0.16);
  }

  enemyGunshot() {
    this.noise(0.1, 0.22, 1900);
  }

  crash(strength) {
    this.noise(0.22, 0.2 + strength * 0.4, 800);
    this.tone(90, 38, 0.2, 'sawtooth', 0.12);
  }

  doorSlam() {
    this.noise(0.07, 0.25, 500);
  }

  horn() {
    this.tone(370, 355, 0.28, 'square', 0.12);
    this.tone(466, 450, 0.28, 'square', 0.08);
  }

  trafficHorn() {
    this.tone(330, 320, 0.16, 'square', 0.05);
  }

  pickup() {
    this.tone(880, 1320, 0.12, 'sine', 0.16);
    this.tone(1320, 1760, 0.14, 'sine', 0.1);
  }

  checkpoint() {
    this.tone(660, 990, 0.16, 'triangle', 0.18);
  }

  missionDone() {
    this.tone(523, 523, 0.12, 'triangle', 0.16);
    setTimeout(() => this.tone(659, 659, 0.12, 'triangle', 0.16), 110);
    setTimeout(() => this.tone(784, 784, 0.22, 'triangle', 0.18), 220);
  }

  bustedSting() {
    this.tone(392, 196, 0.5, 'sawtooth', 0.14);
  }

  reloadClick() {
    this.noise(0.05, 0.18, 3000);
    this.tone(1200, 700, 0.05, 'square', 0.06);
  }
}
