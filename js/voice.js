/* ============================================================
   BEAT THE BULK — Voice coaching
   Spoken rep counts, countdowns, and encouragement via the Web
   Speech API's SpeechSynthesis. No audio files, no backend —
   same "runs entirely in the browser" spirit as js/audio.js.
   ============================================================ */
(function (global) {
  // storage may be blocked or full: settings are best-effort
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  function VoiceEngine() {
    this.supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
    this.enabled = lsGet('btb_voiceEnabled') !== '0'; // on by default
    this.rate = parseFloat(lsGet('btb_voiceRate') || '1');
  }

  /** @param {boolean} on */
  VoiceEngine.prototype.setEnabled = function (on) {
    this.enabled = !!on;
    lsSet('btb_voiceEnabled', this.enabled ? '1' : '0');
    if (!this.enabled && this.supported) window.speechSynthesis.cancel();
  };

  /** @param {number} rate - 0.5 (slow) to 1.5 (fast). */
  VoiceEngine.prototype.setRate = function (rate) {
    this.rate = rate;
    lsSet('btb_voiceRate', String(rate));
  };

  /**
   * Speaks a line. High-priority lines (countdowns) interrupt whatever is
   * currently queued; normal-priority lines are dropped if speech is
   * already in progress, so rep callouts never pile up into a backlog.
   * @param {string} text
   * @param {{priority?: 'normal'|'high'|'queue'}} [opts]
   */
  VoiceEngine.prototype.speak = function (text, opts) {
    if (!this.supported || !this.enabled || !text) return;
    // The app-wide Mute button silences coaching too (separate from the Voice toggle).
    if (global.BTB.Audio && global.BTB.Audio.muted) return;
    const priority = (opts && opts.priority) || 'normal';
    const synth = window.speechSynthesis;
    if (priority === 'high') {
      synth.cancel();
    } else if (synth.speaking && priority !== 'queue') {
      return;
    }
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = this.rate;
    utter.pitch = 1;
    utter.volume = 1;
    synth.speak(utter);
  };

  global.BTB = global.BTB || {};
  global.BTB.Voice = new VoiceEngine();
})(window);
