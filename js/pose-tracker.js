/* ============================================================
   BEAT THE BULK — Pose tracking engine
   Upgrades over a naive threshold-on-raw-y approach:
     1. EMA smoothing of landmarks to kill frame-to-frame jitter
     2. True joint angles (law of cosines via atan2), not just
        "is Y above Y" — works regardless of camera framing
     3. Body-scale normalization (torso length) so thresholds
        hold whether the user is 1.5m or 3m from the camera
     4. Hold-frame debounce + hysteresis state machine per rep,
        so a single noisy frame can't flip the counter
     5. Visibility/confidence gating with a distinct "pose lost"
        UI state instead of silently miscounting
   ============================================================ */
(function (global) {
  const IDX = {
    nose: 0, lShoulder: 11, rShoulder: 12, lElbow: 13, rElbow: 14,
    lWrist: 15, rWrist: 16, lHip: 23, rHip: 24, lKnee: 25, rKnee: 26,
    lAnkle: 27, rAnkle: 28
  };

  /**
   * @typedef {Object} Landmark
   * @property {number} x
   * @property {number} y
   * @property {number} [z]
   * @property {number} [visibility]
   */

  /**
   * Joint angle at vertex `b`, between rays b->a and b->c, via law of cosines.
   * @param {Landmark} a
   * @param {Landmark} b
   * @param {Landmark} c
   * @returns {number|null} Degrees, or null if a/c coincide with the vertex.
   */
  function angleAt(a, b, c) {
    const v1x = a.x - b.x, v1y = a.y - b.y, v2x = c.x - b.x, v2y = c.y - b.y;
    const m1 = Math.hypot(v1x, v1y), m2 = Math.hypot(v2x, v2y);
    if (m1 < 1e-5 || m2 < 1e-5) return null;
    let cos = (v1x * v2x + v1y * v2y) / (m1 * m2);
    cos = Math.max(-1, Math.min(1, cos));
    return Math.acos(cos) * 180 / Math.PI;
  }
  /** @param {Landmark} a @param {Landmark} b @returns {Landmark} */
  function midPt(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
  /** @param {Landmark} a @param {Landmark} b @returns {number} */
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  /** @param {number} d @returns {number} Delta normalized into [-180, 180]. */
  function normAngleDelta(d) { while (d > 180) d -= 360; while (d < -180) d += 360; return d; }
  function vis(lm, i, thr) { return !!(lm[i] && lm[i].visibility !== undefined && lm[i].visibility > (thr || 0.45)); }
  function visAll(lm, idxs, thr) { return idxs.every(i => vis(lm, i, thr)); }

  /**
   * Rest/active hysteresis state machine: fires `true` exactly once when an
   * active->rest transition completes (i.e. one full rep), with an N-frame
   * debounce in both directions so a single noisy frame can't flip it.
   * @param {{phase?: string, aHold?: number, rHold?: number}} state - Mutated in place.
   * @param {boolean} activeNow
   * @param {number} [holdFrames=3]
   * @returns {boolean} True on the frame a rep completes.
   */
  function cycle(state, activeNow, holdFrames) {
    holdFrames = holdFrames || 3;
    if (activeNow) { state.aHold = (state.aHold || 0) + 1; state.rHold = 0; }
    else { state.rHold = (state.rHold || 0) + 1; state.aHold = 0; }
    if (!state.phase) state.phase = 'rest';
    if (state.phase === 'rest' && state.aHold >= holdFrames) { state.phase = 'active'; }
    else if (state.phase === 'active' && state.rHold >= holdFrames) { state.phase = 'rest'; return true; }
    return false;
  }

  function freshState() { return {}; }

  /**
   * Normalizes `value` into [0, 1] on the line from `atThreshold` (the value
   * that just barely crosses into "active", scoring 0) to `atTarget` (the
   * value for excellent form, scoring 1). Works whether the metric grows or
   * shrinks as form improves, since both bounds move together.
   * @param {number} value
   * @param {number} atThreshold
   * @param {number} atTarget
   * @returns {number}
   */
  function normT(value, atThreshold, atTarget) {
    const t = (value - atThreshold) / (atTarget - atThreshold);
    return Math.max(0, Math.min(1, t));
  }
  /**
   * Maps a normalized depth `t` (from normT) to a 0-100 form score. Crossing
   * the threshold at all still "counts" the rep (floor of 40); reaching the
   * target depth scores 100.
   * @param {number} t
   * @returns {number}
   */
  function scoreFromT(t) { return Math.round(40 + t * 60); }

  // ---- Detectors: each returns false, or {done: true, formScore} on rep completion ----
  /**
   * Wraps cycle() for the common case: a single scalar metric where
   * `active` was already decided by the caller, tracking the deepest
   * (best-form) value reached during the active phase in state.formT, and
   * emitting {done, formScore} on rep completion instead of a bare boolean.
   * @param {Object} state
   * @param {boolean} active
   * @param {number} metric
   * @param {number} atThreshold
   * @param {number} atTarget
   * @returns {false|{done: true, formScore: number}}
   */
  function cycleScored(state, active, metric, atThreshold, atTarget) {
    if (active) state.formT = Math.max(state.formT || 0, normT(metric, atThreshold, atTarget));
    const done = cycle(state, active, 3);
    if (!done) return false;
    const formScore = scoreFromT(state.formT || 0);
    state.formT = 0;
    return { done: true, formScore };
  }

  const Detectors = {
    jumping_jacks(lm, state, scale) {
      if (!visAll(lm, [11, 12, 13, 14, 15, 16, 23, 24, 27, 28])) return false;
      const armMargin = side => {
        const sh = lm[side === 'L' ? 11 : 12], wr = lm[side === 'L' ? 15 : 16], el = lm[side === 'L' ? 13 : 14];
        const elbowStraightish = (angleAt(sh, el, wr) || 0) > 120;
        return elbowStraightish ? (sh.y - wr.y) / scale : -1;
      };
      const mL = armMargin('L'), mR = armMargin('R');
      const legGap = dist(lm[27], lm[28]) / scale;
      const active = mL > 0.28 && mR > 0.28 && legGap > 0.42;
      const metric = Math.min(normT(mL, 0.28, 0.45), normT(mR, 0.28, 0.45), normT(legGap, 0.42, 0.60));
      // metric is already 0-1 here, so threshold/target of the outer cycleScored call are a passthrough
      return cycleScored(state, active, metric, 0, 1);
    },

    overhead_press(lm, state, scale) {
      if (!visAll(lm, [11, 12, 13, 14, 15, 16])) return false;
      const raisedMargin = side => {
        const sh = lm[side === 'L' ? 11 : 12], wr = lm[side === 'L' ? 15 : 16], el = lm[side === 'L' ? 13 : 14];
        const straight = (angleAt(sh, el, wr) || 0) > 140;
        return straight ? (sh.y - wr.y) / scale : -1;
      };
      const mL = raisedMargin('L'), mR = raisedMargin('R');
      const active = mL > 0.30 && mR > 0.30;
      const metric = Math.min(normT(mL, 0.30, 0.50), normT(mR, 0.30, 0.50));
      return cycleScored(state, active, metric, 0, 1);
    },

    squats(lm, state, scale) {
      if (!visAll(lm, [23, 24, 25, 26, 27, 28])) return false;
      const kneeL = angleAt(lm[23], lm[25], lm[27]);
      const kneeR = angleAt(lm[24], lm[26], lm[28]);
      if (kneeL === null || kneeR === null) return false;
      const avg = (kneeL + kneeR) / 2;
      const active = avg < 130; // bent knees
      return cycleScored(state, active, avg, 130, 90);
    },

    side_reaches(lm, state, scale) {
      if (!visAll(lm, [11, 12, 23, 24])) return false;
      const shMid = midPt(lm[11], lm[12]), hipMid = midPt(lm[23], lm[24]);
      const lean = (shMid.x - hipMid.x) / scale;
      const active = Math.abs(lean) > 0.20;
      const side = lean > 0 ? 'r' : 'l';
      if (active) {
        state.aHold = (state.aHold || 0) + 1; state.rHold = 0;
        state.formT = Math.max(state.formT || 0, normT(Math.abs(lean), 0.20, 0.38));
        if (state.aHold >= 3 && state.phase !== 'active') { state.phase = 'active'; state.curSide = side; }
      } else {
        state.rHold = (state.rHold || 0) + 1; state.aHold = 0;
        if (state.rHold >= 3 && state.phase === 'active') {
          state.phase = 'rest';
          if (state.curSide && state.curSide !== state.lastSide) {
            state.lastSide = state.curSide;
            const formScore = scoreFromT(state.formT || 0);
            state.formT = 0;
            return { done: true, formScore };
          }
        }
      }
      return false;
    },

    high_knees(lm, state, scale) {
      if (!visAll(lm, [23, 24, 25, 26])) return false;
      const lift = side => {
        const hip = lm[side === 'L' ? 23 : 24], knee = lm[side === 'L' ? 25 : 26];
        const downAngle = Math.atan2(knee.x - hip.x, knee.y - hip.y) * 180 / Math.PI;
        return Math.abs(downAngle);
      };
      const liftL = lift('L'), liftR = lift('R');
      const active = Math.max(liftL, liftR) > 48;
      const side = liftL > liftR ? 'l' : 'r';
      if (active) {
        state.aHold = (state.aHold || 0) + 1; state.rHold = 0;
        state.formT = Math.max(state.formT || 0, normT(Math.max(liftL, liftR), 48, 75));
        if (state.aHold >= 2 && state.phase !== 'active') { state.phase = 'active'; state.curSide = side; }
      } else {
        state.rHold = (state.rHold || 0) + 1; state.aHold = 0;
        if (state.rHold >= 2 && state.phase === 'active') {
          state.phase = 'rest';
          if (state.curSide && state.curSide !== state.lastSide) {
            state.lastSide = state.curSide;
            const formScore = scoreFromT(state.formT || 0);
            state.formT = 0;
            return { done: true, formScore };
          }
        }
      }
      return false;
    },

    arm_circles(lm, state, scale) {
      if (!visAll(lm, [11, 12, 15, 16])) return false;
      const sh = midPt(lm[11], lm[12]), wr = midPt(lm[15], lm[16]);
      const extended = dist(sh, wr) / scale > 0.30;
      if (!extended) { state.lastAngle = null; return false; }
      const ang = Math.atan2(wr.y - sh.y, wr.x - sh.x) * 180 / Math.PI;
      if (state.lastAngle === null || state.lastAngle === undefined) { state.lastAngle = ang; state.rotAcc = 0; return false; }
      let delta = normAngleDelta(ang - state.lastAngle);
      state.lastAngle = ang;
      if (Math.abs(delta) > 45) return false; // reject spikes
      state.rotAcc = (state.rotAcc || 0) + delta;
      if (Math.abs(state.rotAcc) >= 330) {
        // Overshoot past 330 toward a fuller rotation reads as a rounder,
        // more complete circle rather than a rep that just barely counted.
        const formScore = scoreFromT(normT(Math.abs(state.rotAcc), 330, 370));
        state.rotAcc = 0;
        return { done: true, formScore };
      }
      return false;
    },

    push_ups(lm, state, scale) {
      if (!visAll(lm, [11, 12, 13, 14, 15, 16])) return false;
      const elbowL = angleAt(lm[11], lm[13], lm[15]);
      const elbowR = angleAt(lm[12], lm[14], lm[16]);
      if (elbowL === null || elbowR === null) return false;
      const avg = (elbowL + elbowR) / 2;
      const active = avg < 110;
      return cycleScored(state, active, avg, 110, 75);
    },

    lunges(lm, state, scale) {
      if (!visAll(lm, [23, 24, 25, 26, 27, 28])) return false;
      const kneeL = angleAt(lm[23], lm[25], lm[27]);
      const kneeR = angleAt(lm[24], lm[26], lm[28]);
      if (kneeL === null || kneeR === null) return false;
      const minKnee = Math.min(kneeL, kneeR);
      const active = minKnee < 120 && Math.abs(kneeL - kneeR) > 15;
      return cycleScored(state, active, minKnee, 120, 90);
    },

    bicep_curls(lm, state, scale) {
      if (!visAll(lm, [11, 12, 13, 14, 15, 16])) return false;
      const elbowL = angleAt(lm[11], lm[13], lm[15]);
      const elbowR = angleAt(lm[12], lm[14], lm[16]);
      if (elbowL === null || elbowR === null) return false;
      const avg = (elbowL + elbowR) / 2;
      const active = avg < 50; // curled up toward the shoulder
      return cycleScored(state, active, avg, 50, 25);
    },

    lateral_raises(lm, state, scale) {
      if (!visAll(lm, [11, 12, 15, 16])) return false;
      const sideMetric = side => {
        const sh = lm[side === 'L' ? 11 : 12], wr = lm[side === 'L' ? 15 : 16];
        const atShoulderHeight = Math.abs(sh.y - wr.y) / scale < 0.14;
        const armOut = Math.abs(wr.x - sh.x) / scale;
        return atShoulderHeight && armOut > 0.34 ? armOut : -1;
      };
      const mL = sideMetric('L'), mR = sideMetric('R');
      const active = mL > 0 && mR > 0;
      const metric = Math.min(normT(mL, 0.34, 0.50), normT(mR, 0.34, 0.50));
      return cycleScored(state, active, metric, 0, 1);
    },

    toe_touches(lm, state, scale) {
      if (!visAll(lm, [11, 12, 23, 24, 25, 26])) return false;
      const hipAngleL = angleAt(lm[11], lm[23], lm[25]);
      const hipAngleR = angleAt(lm[12], lm[24], lm[26]);
      if (hipAngleL === null || hipAngleR === null) return false;
      const avg = (hipAngleL + hipAngleR) / 2;
      const active = avg < 100; // torso folded forward at the hips
      return cycleScored(state, active, avg, 100, 70);
    }
  };

  function Tracker(videoEl, canvasEl, opts) {
    this.video = videoEl;
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext('2d');
    this.opts = opts || {};
    this.smoothed = null;
    this.currentDetectorKey = 'jumping_jacks';
    this.exState = freshState();
    this.enabled = false;
    this.lastRepMs = 0;
    this.minRepGapMs = 260;
    this.poseFound = false;
  }

  // MediaPipe is only needed once Begin is pressed, so load it on demand; a failed load rejects start().
  let mpLoad = null;
  function loadMediaPipe() {
    if (mpLoad) return mpLoad;
    const base = 'https://cdn.jsdelivr.net/npm/@mediapipe/';
    mpLoad = Promise.all(['camera_utils/camera_utils.js', 'drawing_utils/drawing_utils.js', 'pose/pose.js'].map(p =>
      new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = base + p;
        s.crossOrigin = 'anonymous';
        s.onload = resolve;
        s.onerror = () => reject(new Error('MediaPipe failed to load: ' + p));
        document.head.appendChild(s);
      })
    )).catch(e => { mpLoad = null; throw e; });
    return mpLoad;
  }

  Tracker.prototype._initPose = function () {
    const self = this;
    this.pose = new Pose({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${f}` });
    this.pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.6
    });
    this.pose.onResults(res => self._onResults(res));
  };

  Tracker.prototype.setExercise = function (detectorKey) {
    this.currentDetectorKey = detectorKey;
    this.exState = freshState();
  };

  Tracker.prototype.setEnabled = function (on) { this.enabled = on; };

  Tracker.prototype._smooth = function (raw) {
    const ALPHA = 0.5;
    if (!this.smoothed) {
      this.smoothed = raw.map(p => ({ x: p.x, y: p.y, z: p.z, visibility: p.visibility }));
      return this.smoothed;
    }
    for (let i = 0; i < raw.length; i++) {
      const s = this.smoothed[i], r = raw[i];
      s.x = ALPHA * r.x + (1 - ALPHA) * s.x;
      s.y = ALPHA * r.y + (1 - ALPHA) * s.y;
      s.visibility = r.visibility;
    }
    return this.smoothed;
  };

  Tracker.prototype._onResults = function (results) {
    const canvas = this.canvas, ctx = this.ctx;
    canvas.width = this.video.videoWidth || 640;
    canvas.height = this.video.videoHeight || 480;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!results.poseLandmarks) {
      if (this.poseFound) { this.poseFound = false; this.opts.onPoseLost && this.opts.onPoseLost(); }
      return;
    }
    if (!this.poseFound) { this.poseFound = true; this.opts.onPoseFound && this.opts.onPoseFound(); }

    const lm = this._smooth(results.poseLandmarks);
    const requiredVisible = visAll(lm, [11, 12, 23, 24], 0.4);
    const confColor = requiredVisible ? 'rgba(34,197,94,0.55)' : 'rgba(239,68,68,0.5)';

    drawConnectors(ctx, lm, POSE_CONNECTIONS, { color: confColor, lineWidth: 2 });
    drawLandmarks(ctx, lm, { color: '#f97316', lineWidth: 1, radius: 2.6 });

    if (this.opts.onConfidence) this.opts.onConfidence(requiredVisible);

    if (!this.enabled || !requiredVisible) return;

    const shMid = midPt(lm[11], lm[12]), hipMid = midPt(lm[23], lm[24]);
    const scale = Math.max(dist(shMid, hipMid), 0.08);

    const detector = Detectors[this.currentDetectorKey];
    if (!detector) return;
    const now = Date.now();
    const result = detector(lm, this.exState, scale);
    if (result && result.done && (now - this.lastRepMs) > this.minRepGapMs) {
      this.lastRepMs = now;
      this.opts.onRep && this.opts.onRep(result.formScore);
    }
  };

  Tracker.prototype.start = function () {
    const self = this;
    return loadMediaPipe()
      .then(() => { if (!this.pose) this._initPose(); })
      .then(() => navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' } }))
      .then(stream => {
        this.video.srcObject = stream;
        return this.video.play();
      })
      .then(() => {
        this.camera = new Camera(this.video, {
          onFrame: async () => { await self.pose.send({ image: self.video }); },
          width: 640, height: 480
        });
        this.camera.start();
        return true;
      });
  };

  global.BTB = global.BTB || {};
  global.BTB.PoseTracker = Tracker;
  global.BTB.PoseDetectorKeys = Object.keys(Detectors);
  global.BTB.PoseMath = { angleAt, midPt, dist, normAngleDelta, cycle, freshState };
  global.BTB.Detectors = Detectors;
})(window);
