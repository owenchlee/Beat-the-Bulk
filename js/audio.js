/* ============================================================
   BEAT THE BULK — Synthesized audio engine
   Everything here — music bed, drums, countdown beeps, fanfares —
   is generated live with the Web Audio API. No external audio
   files: nothing to license, nothing that can 404, works fully
   offline, and loads instantly.
   ============================================================ */
(function (global) {
  function AudioEngine() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.shimmerDelay = null;
    this.noiseBuffer = null;
    this.unlocked = false;
    this.musicPlaying = false;
    this.musicTimer = null;
    this.step = 0;
    this.bpm = 116;
    this.pattern = 'A';
    this.muted = localStorage.getItem('btb_muted') === '1';
    this.musicVol = parseFloat(localStorage.getItem('btb_musicVol') || '0.55');
    this.sfxVol = parseFloat(localStorage.getItem('btb_sfxVol') || '0.8');
  }

  AudioEngine.prototype.unlock = function () {
    if (this.unlocked) return;
    this.unlocked = true;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = this.musicVol;
    this.musicGain.connect(this.master);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = this.sfxVol;
    this.sfxGain.connect(this.master);

    // Short shimmer delay bus for celebratory stings
    const delay = this.ctx.createDelay();
    delay.delayTime.value = 0.16;
    const fb = this.ctx.createGain();
    fb.gain.value = 0.22;
    const wet = this.ctx.createGain();
    wet.gain.value = 0.35;
    delay.connect(fb); fb.connect(delay);
    delay.connect(wet); wet.connect(this.sfxGain);
    this.shimmerDelay = delay;

    this._buildNoiseBuffer();
    if (this.ctx.state === 'suspended') this.ctx.resume();
  };

  AudioEngine.prototype._buildNoiseBuffer = function () {
    const len = this.ctx.sampleRate * 1;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buf;
  };

  AudioEngine.prototype.setMusicVolume = function (v) {
    this.musicVol = v; localStorage.setItem('btb_musicVol', v);
    if (this.musicGain) this.musicGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  };
  AudioEngine.prototype.setSfxVolume = function (v) {
    this.sfxVol = v; localStorage.setItem('btb_sfxVol', v);
    if (this.sfxGain) this.sfxGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  };
  AudioEngine.prototype.setMuted = function (m) {
    this.muted = m; localStorage.setItem('btb_muted', m ? '1' : '0');
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.05);
  };

  // ---- Primitives ----
  AudioEngine.prototype._tone = function (bus, opts) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + (opts.delay || 0);
    const osc = ctx.createOscillator();
    osc.type = opts.type || 'sine';
    osc.frequency.setValueAtTime(opts.freq, t0);
    if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.slideTo), t0 + (opts.dur || 0.2));
    const g = ctx.createGain();
    const peak = opts.gain !== undefined ? opts.gain : 0.25;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + (opts.attack || 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + (opts.dur || 0.2));
    /** @type {AudioNode} */
    let node = osc;
    if (opts.filterFreq) {
      const f = ctx.createBiquadFilter();
      f.type = opts.filterType || 'lowpass';
      f.frequency.value = opts.filterFreq;
      osc.connect(f); node = f;
    }
    node.connect(g);
    g.connect(bus);
    if (opts.shimmer) g.connect(this.shimmerDelay);
    osc.start(t0);
    osc.stop(t0 + (opts.dur || 0.2) + 0.05);
  };

  AudioEngine.prototype._noise = function (bus, opts) {
    if (!this.ctx || !this.noiseBuffer) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + (opts.delay || 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = opts.filterType || 'highpass';
    f.frequency.value = opts.filterFreq || 6000;
    const g = ctx.createGain();
    const peak = opts.gain !== undefined ? opts.gain : 0.2;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + (opts.dur || 0.06));
    src.connect(f); f.connect(g); g.connect(bus);
    src.start(t0); src.stop(t0 + (opts.dur || 0.06) + 0.02);
  };

  // ---- SFX ----
  const SFX = {
    click(a) { a._tone(a.sfxGain, { freq: 1100, type: 'square', dur: 0.045, gain: 0.10, attack: 0.002 }); },
    tabSwitch(a) {
      a._tone(a.sfxGain, { freq: 520, slideTo: 920, type: 'sine', dur: 0.09, gain: 0.12 });
    },
    countdownTick(a, n) {
      const freq = n === 1 ? 740 : 660;
      a._tone(a.sfxGain, { freq, type: 'triangle', dur: 0.14, gain: 0.22, attack: 0.005 });
    },
    countdownGo(a) {
      a._tone(a.sfxGain, { freq: 880, type: 'triangle', dur: 0.16, gain: 0.26, shimmer: true });
      a._tone(a.sfxGain, { freq: 1320, type: 'triangle', dur: 0.22, gain: 0.24, delay: 0.09, shimmer: true });
    },
    rep(a) { a._tone(a.sfxGain, { freq: 700, type: 'square', dur: 0.05, gain: 0.09, attack: 0.002 }); },
    setComplete(a) {
      [523.25, 659.25, 784.0].forEach((f, i) => a._tone(a.sfxGain, { freq: f, type: 'triangle', dur: 0.22, gain: 0.2, delay: i * 0.09, shimmer: true }));
    },
    workoutComplete(a) {
      [523.25, 659.25, 784.0, 1046.5, 1318.5].forEach((f, i) => a._tone(a.sfxGain, { freq: f, type: 'triangle', dur: 0.28, gain: 0.22, delay: i * 0.08, shimmer: true }));
      setTimeout(() => {
        [523.25, 659.25, 784.0].forEach(f => a._tone(a.sfxGain, { freq: f, type: 'sine', dur: 0.9, gain: 0.14, shimmer: true }));
      }, 420);
    },
    milestone(a) {
      [784, 987.77, 1174.66, 1568].forEach((f, i) => a._tone(a.sfxGain, { freq: f, type: 'sine', dur: 0.5, gain: 0.18, delay: i * 0.06, shimmer: true }));
    },
    eatHealthy(a) {
      a._tone(a.sfxGain, { freq: 784, type: 'sine', dur: 0.12, gain: 0.18 });
      a._tone(a.sfxGain, { freq: 1046, type: 'sine', dur: 0.18, gain: 0.16, delay: 0.07 });
    },
    eatUnhealthy(a) {
      a._tone(a.sfxGain, { freq: 330, slideTo: 190, type: 'sawtooth', dur: 0.28, gain: 0.12, filterFreq: 1200 });
    },
    poseLost(a) {
      a._tone(a.sfxGain, { freq: 220, type: 'sine', dur: 0.18, gain: 0.08 });
    },
    poseFound(a) {
      a._tone(a.sfxGain, { freq: 660, type: 'sine', dur: 0.1, gain: 0.1 });
    }
  };

  AudioEngine.prototype.play = function (name, arg) {
    if (!this.unlocked) return;
    const fn = SFX[name];
    if (fn) fn(this, arg);
  };

  // ---- Background music: 16th-note lookahead scheduler ----
  const SCALE = [220.00, 261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25, 783.99];
  const PATTERNS = {
    A: [0, 2, 4, 5, 4, 2, 0, 2, 1, 3, 5, 6, 5, 3, 1, 3],
    B: [4, 5, 6, 8, 6, 5, 4, 5, 3, 5, 6, 8, 6, 4, 3, 2]
  };
  const KICK_STEPS = [0, 8];
  const SNARE_STEPS = [4, 12];

  AudioEngine.prototype._scheduleStep = function (stepIndex, time) {
    const ctx = this.ctx;
    const pat = PATTERNS[this.pattern];
    const noteIdx = pat[stepIndex % pat.length];

    // Lead arpeggio note
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = SCALE[noteIdx];
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.16, time + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.16);
    osc.connect(g); g.connect(this.musicGain);
    osc.start(time); osc.stop(time + 0.2);

    // Bass every 4 steps
    if (stepIndex % 4 === 0) {
      const bosc = ctx.createOscillator();
      bosc.type = 'sine';
      bosc.frequency.value = SCALE[noteIdx % 5] / 2;
      const bg = ctx.createGain();
      bg.gain.setValueAtTime(0.0001, time);
      bg.gain.exponentialRampToValueAtTime(0.22, time + 0.01);
      bg.gain.exponentialRampToValueAtTime(0.0001, time + 0.3);
      bosc.connect(bg); bg.connect(this.musicGain);
      bosc.start(time); bosc.stop(time + 0.32);
    }

    // Kick
    if (KICK_STEPS.includes(stepIndex % 16)) {
      const kosc = ctx.createOscillator();
      kosc.type = 'sine';
      kosc.frequency.setValueAtTime(150, time);
      kosc.frequency.exponentialRampToValueAtTime(42, time + 0.12);
      const kg = ctx.createGain();
      kg.gain.setValueAtTime(0.5, time);
      kg.gain.exponentialRampToValueAtTime(0.001, time + 0.14);
      kosc.connect(kg); kg.connect(this.musicGain);
      kosc.start(time); kosc.stop(time + 0.15);
    }
    // Snare (filtered noise)
    if (SNARE_STEPS.includes(stepIndex % 16)) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = 1800;
      const sg = ctx.createGain();
      sg.gain.setValueAtTime(0.22, time);
      sg.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
      src.connect(f); f.connect(sg); sg.connect(this.musicGain);
      src.start(time); src.stop(time + 0.12);
    }
    // Hat
    if (stepIndex % 2 === 0) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const f = ctx.createBiquadFilter();
      f.type = 'highpass'; f.frequency.value = 8000;
      const hg = ctx.createGain();
      const peak = (stepIndex % 16 === 0) ? 0.12 : 0.06;
      hg.gain.setValueAtTime(peak, time);
      hg.gain.exponentialRampToValueAtTime(0.001, time + 0.035);
      src.connect(f); f.connect(hg); hg.connect(this.musicGain);
      src.start(time); src.stop(time + 0.04);
    }
  };

  AudioEngine.prototype.startMusic = function (intensity) {
    if (!this.unlocked || this.musicPlaying) return;
    this.bpm = intensity === 'intense' ? 140 : intensity === 'light' ? 100 : 120;
    this.musicPlaying = true;
    this.step = 0;
    this.nextStepTime = this.ctx.currentTime + 0.05;
    const self = this;
    const lookahead = 25, scheduleAhead = 0.12;
    this.musicTimer = setInterval(() => {
      if (!self.musicPlaying) return;
      const stepDur = 60 / self.bpm / 4;
      while (self.nextStepTime < self.ctx.currentTime + scheduleAhead) {
        if (self.step > 0 && self.step % 64 === 0) self.pattern = self.pattern === 'A' ? 'B' : 'A';
        self._scheduleStep(self.step % 16, self.nextStepTime);
        self.nextStepTime += stepDur;
        self.step++;
      }
    }, lookahead);
  };

  AudioEngine.prototype.setIntensity = function (intensity) {
    this.bpm = intensity === 'intense' ? 140 : intensity === 'light' ? 100 : 120;
  };

  AudioEngine.prototype.stopMusic = function () {
    this.musicPlaying = false;
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null;
  };

  global.BTB = global.BTB || {};
  global.BTB.Audio = new AudioEngine();
})(window);
