/* ============================================================
   BEAT THE BULK — Persistent store + progress tracker
   ============================================================ */

/**
 * @typedef {Object} DayRecord
 * @property {number} day
 * @property {number} weight
 * @property {number} repsTotal
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
 */

(function (global) {
  /** @type {StoreState} */
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
    intensity: 'moderate'
  };

  function Store() {
    /** @type {StoreState} */
    this.state = Object.assign({}, DEFAULTS, this._loadJSON('btb_state', {}));
    /** @type {DayRecord[]} */
    this.history = this._loadJSON('btb_history', []);
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
  Store.prototype.save = function () {
    localStorage.setItem('btb_state', JSON.stringify(this.state));
    localStorage.setItem('btb_history', JSON.stringify(this.history));
  };
  Store.prototype.reset = function () {
    this.state = Object.assign({}, DEFAULTS);
    this.history = [];
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
  function drawWeightChart(canvas, store) {
    const ctx = canvas.getContext('2d');
    const W = canvas.clientWidth || 380, H = 170;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const s = store.state;
    const data = [{ day: 0, weight: s.startWeight }].concat(store.history.map(h => ({ day: h.day, weight: h.weight })));
    if (data.length < 2) {
      ctx.fillStyle = '#6b7386'; ctx.font = '13px Barlow, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Complete a workout to start your chart', W / 2, H / 2);
      return;
    }
    const pad = 34;
    const mn = Math.min(s.goalWeight, ...data.map(d => d.weight)) - 4;
    const mx = Math.max(s.startWeight, ...data.map(d => d.weight)) + 4;
    const xs = (W - pad * 2) / (data.length - 1);
    const ys = (H - pad * 1.4) / (mx - mn);
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
  function drawWeeklyChart(canvas, store) {
    const ctx = canvas.getContext('2d');
    const W = canvas.clientWidth || 380, H = 120;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const last7 = store.history.slice(-7);
    if (!last7.length) {
      ctx.fillStyle = '#6b7386'; ctx.font = '12px Barlow, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('No workouts logged yet', W / 2, H / 2);
      return;
    }
    const pad = 24;
    const maxReps = Math.max(...last7.map(d => d.repsTotal), 10);
    const bw = (W - pad * 2) / last7.length;
    last7.forEach((d, i) => {
      const h = (d.repsTotal / maxReps) * (H - pad * 1.6);
      const x = pad + i * bw + bw * 0.18;
      const y = H - pad * 0.8 - h;
      const grad = ctx.createLinearGradient(0, y, 0, y + h);
      grad.addColorStop(0, '#22c55e'); grad.addColorStop(1, '#16a34a');
      ctx.fillStyle = grad;
      const w = bw * 0.64;
      roundRect(ctx, x, y, w, h, 4); ctx.fill();
      ctx.fillStyle = '#6b7386'; ctx.font = '10px Barlow, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('D' + d.day, x + w / 2, H - 6);
    });
  }
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
