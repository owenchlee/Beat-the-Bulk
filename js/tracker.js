/* ============================================================
   BEAT THE BULK — Persistent store + progress tracker
   ============================================================ */

/**
 * @typedef {Object} DayRecord
 * @property {number} day
 * @property {number} weight
 * @property {number} repsTotal
 * @property {number|null} [avgFormScore]
 */

/**
 * @typedef {Object} StoreState
 * @property {string} name
 * @property {number} startWeight
 * @property {number} weight
 * @property {number} goalWeight
 * @property {number} day
 * @property {number} streak
 * @property {number} bestStreak
 * @property {string|null} lastPlayDate
 * @property {number} totalReps
 * @property {number} totalWorkouts
 * @property {number} totalCaloriesBurned
 * @property {string} goal
 * @property {string} intensity
 * @property {string} gender
 * @property {string[]} [unlockedAchievements] - Always present once _ensureCollections() has run.
 * @property {Object.<string, boolean>} [exercisesTried] - Always present once _ensureCollections() has run.
 */

(function (global) {
  // Primitive-only subset of StoreState — unlockedAchievements/exercisesTried
  // are seeded separately by _ensureCollections(), never placed here (see
  // note below), so this intentionally isn't typed as the full StoreState.
  const DEFAULTS = {
    name: 'Buddy',
    startWeight: 210,
    weight: 210,
    goalWeight: 175,
    day: 1,
    streak: 1,
    bestStreak: 1,
    lastPlayDate: null,
    totalReps: 0,
    totalWorkouts: 0,
    totalCaloriesBurned: 0,
    goal: 'weight_loss',
    intensity: 'moderate',
    gender: 'male'
  };

  function Store() {
    /** @type {StoreState} */
    this.state = Object.assign({}, DEFAULTS, this._plainObject(this._loadJSON('btb_state', {})));
    // Keep only values matching DEFAULTS' type (finite for numbers), else default.
    for (const k of Object.keys(DEFAULTS)) {
      const d = DEFAULTS[k], v = this.state[k];
      const ok = typeof d === 'number' ? Number.isFinite(v) : d === null ? (v === null || typeof v === 'string') : typeof v === typeof d;
      if (!ok) this.state[k] = d;
    }
    this._ensureCollections();
    const h = this._loadJSON('btb_history', []);
    /** @type {DayRecord[]} */
    this.history = Array.isArray(h) ? h.filter(r => r && typeof r === 'object') : [];
    this._base = { state: JSON.parse(JSON.stringify(this.state)), history: this.history.slice() };
  }
  /**
   * @param {string} key
   * @param {*} fallback
   * @returns {*}
   */
  Store.prototype._loadJSON = function (key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch (e) { return fallback; }
  };
  // DEFAULTS stays primitive-only so Object.assign never aliases a shared
  // array/object across Store instances; collection fields are seeded here.
  Store.prototype._plainObject = function (v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; };
  Store.prototype._ensureCollections = function () {
    if (!Array.isArray(this.state.unlockedAchievements)) this.state.unlockedAchievements = [];
    const et = this.state.exercisesTried;
    if (!et || typeof et !== 'object' || Array.isArray(et)) this.state.exercisesTried = {};
  };
  /** @param {string} id */
  Store.prototype.unlockAchievement = function (id) {
    const list = this.state.unlockedAchievements || (this.state.unlockedAchievements = []);
    if (!list.includes(id)) list.push(id);
  };
  /** @param {string} key */
  Store.prototype.markExerciseTried = function (key) {
    (this.state.exercisesTried || (this.state.exercisesTried = {}))[key] = true;
  };
  const COUNTERS = ['day', 'totalWorkouts', 'totalReps', 'totalCaloriesBurned'];
  // Re-read what is on disk (another tab may have saved) and treat it as our new baseline.
  Store.prototype.refresh = function () {
    this.state = Object.assign({}, DEFAULTS, this._loadJSON('btb_state', {}));
    this._ensureCollections();
    this.history = this._loadJSON('btb_history', []);
    this._base = { state: JSON.parse(JSON.stringify(this.state)), history: this.history.slice() };
  };
  // Merge our edits (diff vs the last loaded/saved baseline) onto the latest stored data,
  // so a stale tab does not clobber another tab's save.
  Store.prototype._merge = function () {
    const base = this._base;
    if (!base) return;
    const latest = Object.assign({}, DEFAULTS, this._loadJSON('btb_state', {}));
    const latestHist = this._loadJSON('btb_history', []);
    const merged = latest;
    for (const k of Object.keys(this.state)) {
      const mine = JSON.stringify(this.state[k]);
      if (mine === JSON.stringify(base.state[k])) continue;
      const bk = base.state[k];
      merged[k] = COUNTERS.includes(k) && typeof bk === 'number' && typeof latest[k] === 'number'
        ? latest[k] + (this.state[k] - bk) : this.state[k];
    }
    const bl = base.history.length;
    const extends_ = this.history.length >= bl && JSON.stringify(this.history.slice(0, bl)) === JSON.stringify(base.history);
    this.state = merged;
    this._ensureCollections();
    if (extends_) {
      this.history = latestHist.concat(this.history.slice(bl)).slice(-120);
    }
  };
  Store.prototype.save = function () {
    if (!this._resetting) this._merge();
    this._resetting = false;
    try { // blocked/full storage: keep in-memory state working
      localStorage.setItem('btb_state', JSON.stringify(this.state));
      localStorage.setItem('btb_history', JSON.stringify(this.history));
    } catch (e) { /* ignore */ }
    this._base = { state: JSON.parse(JSON.stringify(this.state)), history: this.history.slice() };
  };
  Store.prototype.reset = function () {
    this.state = Object.assign({}, DEFAULTS);
    this._ensureCollections();
    this.history = [];
    this._resetting = true;
    this.save();
  };
  /** @param {DayRecord} record */
  Store.prototype.recordDay = function (record) {
    this.history.push(record);
    if (this.history.length > 120) this.history.shift();
    this.save();
  };

  /**
   * @param {InstanceType<typeof Store>} store
   * @returns {{lost: number, toGo: number, totalWorkouts: number, totalReps: number, streak: number, bestStreak: number, caloriesBurned: number}}
   */
  function computeStats(store) {
    const s = store.state;
    return {
      lost: Math.max(0, s.startWeight - s.weight),
      toGo: Math.max(0, s.weight - s.goalWeight),
      totalWorkouts: s.totalWorkouts,
      totalReps: s.totalReps,
      streak: s.streak,
      bestStreak: s.bestStreak,
      caloriesBurned: Math.round(s.totalCaloriesBurned)
    };
  }

  // ---- Weight-over-time line chart on <canvas> ----
  /** @param {any} canvas @param {any} store */
  function drawWeightChart(canvas, store) {
    const ctx = canvas.getContext('2d');
    const W = canvas.clientWidth || 380, H = 170;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const s = store.state;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Weight journey: ' + s.weight + ' lbs now, goal ' + s.goalWeight + ' lbs, started at ' + s.startWeight);
    const data = [{ day: 0, weight: s.startWeight }].concat(store.history.filter((/** @type {*} */ h) => h && Number.isFinite(h.weight) && Number.isFinite(h.day)).map((/** @type {*} */ h) => ({ day: h.day, weight: h.weight })));
    if (data.length < 2) {
      ctx.fillStyle = '#9aa4b8'; ctx.font = '13px Barlow, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Complete a workout to start your chart', W / 2, H / 2);
      return;
    }
    const pad = 34;
    const mn = Math.min(s.goalWeight, ...data.map(d => d.weight)) - 4;
    const mx = Math.max(s.startWeight, ...data.map(d => d.weight)) + 4;
    const xs = (W - pad * 2) / (data.length - 1);
    const ys = (H - pad * 1.4) / (mx - mn);
    /** @param {number} w */
    const yFor = w => (H - pad * 0.6) - (w - mn) * ys;

    // Goal dashed line
    const gY = yFor(s.goalWeight);
    ctx.strokeStyle = 'rgba(34,197,94,0.45)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(pad, gY); ctx.lineTo(W - pad, gY); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#22c55e'; ctx.font = '10px Barlow, sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('Goal ' + s.goalWeight, pad + 4, gY - 5);

    // Area fill
    ctx.beginPath();
    data.forEach((d, i) => { const x = pad + i * xs, y = yFor(d.weight); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.lineTo(pad + (data.length - 1) * xs, H - pad * 0.6);
    ctx.lineTo(pad, H - pad * 0.6);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, 'rgba(249,115,22,0.22)');
    grad.addColorStop(1, 'rgba(249,115,22,0.0)');
    ctx.fillStyle = grad; ctx.fill();

    // Line
    ctx.beginPath();
    ctx.strokeStyle = '#f97316'; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
    data.forEach((d, i) => { const x = pad + i * xs, y = yFor(d.weight); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke();
    data.forEach((d, i) => {
      const x = pad + i * xs, y = yFor(d.weight);
      ctx.beginPath(); ctx.arc(x, y, 3.2, 0, Math.PI * 2); ctx.fillStyle = '#f97316'; ctx.fill();
    });
  }

  // ---- Weekly reps bar chart ----
  /** @param {any} canvas @param {any} store */
  function drawWeeklyChart(canvas, store) {
    const ctx = canvas.getContext('2d');
    const W = canvas.clientWidth || 380, H = 120;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const last7 = store.history.filter(d => d && typeof d === 'object').slice(-7)
      .map(d => ({ day: Number.isFinite(d.day) ? d.day : '?', repsTotal: Number.isFinite(d.repsTotal) ? Math.max(0, d.repsTotal) : 0 }));
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', last7.length
      ? 'Reps per day: ' + last7.map(d => 'day ' + d.day + ' ' + d.repsTotal + ' reps').join(', ')
      : 'No workouts logged yet');
    if (!last7.length) {
      ctx.fillStyle = '#9aa4b8'; ctx.font = '12px Barlow, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('No workouts logged yet', W / 2, H / 2);
      return;
    }
    const pad = 24;
    const maxReps = Math.max(...last7.map((/** @type {*} */ d) => d.repsTotal), 10);
    const bw = (W - pad * 2) / last7.length;
    last7.forEach((/** @type {*} */ d, /** @type {number} */ i) => {
      const h = (d.repsTotal / maxReps) * (H - pad * 1.6);
      const x = pad + i * bw + bw * 0.18;
      const y = H - pad * 0.8 - h;
      const grad = ctx.createLinearGradient(0, y, 0, y + h);
      grad.addColorStop(0, '#22c55e'); grad.addColorStop(1, '#16a34a');
      ctx.fillStyle = grad;
      const w = bw * 0.64;
      roundRect(ctx, x, y, w, h, 4); ctx.fill();
      ctx.fillStyle = '#9aa4b8'; ctx.font = '10px Barlow, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('D' + d.day, x + w / 2, H - 6);
    });
  }
  /** @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {number} w @param {number} h @param {number} r */
  function roundRect(ctx, x, y, w, h, r) {
    if (h < 1) h = 1;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  global.BTB = global.BTB || {};
  global.BTB.Store = Store;
  global.BTB.computeStats = computeStats;
  global.BTB.drawWeightChart = drawWeightChart;
  global.BTB.drawWeeklyChart = drawWeeklyChart;
})(window);
