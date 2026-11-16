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
  /** @param {any[]} lm @param {number} i @param {number} [thr] @returns {boolean} */
  function vis(lm, i, thr) { return !!(lm[i] && lm[i].visibility !== undefined && lm[i].visibility > (thr || 0.45)); }
  /** @param {any[]} lm @param {number[]} idxs @param {number} [thr] @returns {boolean} */
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
   * Angle (degrees) of the ray from `a` to `b`, measured clockwise from
   * straight-down (matches the character rig's rest pose: limbs hang
   * straight down at 0deg, and CSS `rotate(deg)` is clockwise-positive in
   * screen coordinates — same convention as `atan2(dx,dy)` here). Used to
   * drive live limb mirroring on the character rig, not for rep detection.
   * @param {Landmark[]} lm @param {number} aIdx @param {number} bIdx
   * @returns {number|undefined} Degrees, or undefined if either point isn't confidently visible.
   */
  function limbAngleDeg(lm, aIdx, bIdx) {
    if (!vis(lm, aIdx) || !vis(lm, bIdx)) return undefined;
    const a = lm[aIdx], b = lm[bIdx];
    return Math.atan2(b.x - a.x, b.y - a.y) * 180 / Math.PI;
  }

  /**
   * Whole-arm (shoulder->wrist) and whole-leg (hip->knee) angles for every
   * limb the character rig can move, keyed to match `Character.setLiveAngles`.
   * @param {Landmark[]} lm
   */
  function computeLiveAngles(lm) {
    return {
      L: limbAngleDeg(lm, IDX.lShoulder, IDX.lWrist),
      R: limbAngleDeg(lm, IDX.rShoulder, IDX.rWrist),
      legL: limbAngleDeg(lm, IDX.lHip, IDX.lKnee),
      legR: limbAngleDeg(lm, IDX.rHip, IDX.rKnee)
    };
  }

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
   * @param {{phase?: string, aHold?: number, rHold?: number, formT?: number}} state
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

  /** @type {Record<string, (lm: any[], state: any, scale: number) => any>} */
  const Detectors = {
    jumping_jacks(lm, state, scale) {
      if (!visAll(lm, [11, 12, 13, 14, 15, 16, 23, 24, 27, 28])) return false;
      const armMargin = (/** @type {string} */ side) => {
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
      const raisedMargin = (/** @type {string} */ side) => {
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
      // Front view: knee angle stays ~180, but the thigh's share of the hip->ankle vertical span shrinks
      // (standing ~0.5, deep squat ~0.39); a ratio needs no torso scale.
      const span = (lm[27].y - lm[23].y) + (lm[28].y - lm[24].y);
      const drop = span > 1e-5 ? ((lm[25].y - lm[23].y) + (lm[26].y - lm[24].y)) / span : 1;
      const active = avg < 130 || drop < 0.45;
      const t = Math.max(normT(avg, 130, 90), normT(drop, 0.45, 0.35));
      return cycleScored(state, active, t, 0, 1);
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
      const lift = (/** @type {string} */ side) => {
        const hip = lm[side === 'L' ? 23 : 24], knee = lm[side === 'L' ? 25 : 26];
        const downAngle = Math.atan2(knee.x - hip.x, knee.y - hip.y) * 180 / Math.PI;
        // Front view: a knee raised toward the camera keeps downAngle ~0 but its drop below the hip shrinks
        // (standing ~0.8 torso, raised ~0.05); map that drop onto the same 48-75 degree scale.
        const drop = (knee.y - hip.y) / scale;
        const dropLift = drop < 0.45 ? 48 + normT(drop, 0.45, 0.10) * 27 : 0;
        return Math.max(Math.abs(downAngle), dropLift);
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
      // View-independent: arms held out to the sides, wrists bob above the shoulder line once per circle.
      const reach = Math.min(Math.abs(lm[15].x - lm[11].x), Math.abs(lm[16].x - lm[12].x)) / scale;
      const rise = ((lm[11].y - lm[15].y) + (lm[12].y - lm[16].y)) / 2 / scale;
      const active = reach > 0.45 && rise > 0.10;
      return cycleScored(state, active, rise, 0.10, 0.25);
    },

    push_ups(lm, state, scale) {
      // Best-visible arm only; the far arm is often occluded in side views.
      const armVis = s => lm[s] && lm[s + 2] && lm[s + 4] ? Math.min(lm[s].visibility, lm[s + 2].visibility, lm[s + 4].visibility) : 0;
      const s = armVis(11) >= armVis(12) ? 11 : 12;
      const ank = vis(lm, 27) ? lm[27] : vis(lm, 28) ? lm[28] : null;
      if (armVis(s) <= 0.45 || !ank) return false;
      // Plank body: shoulder-to-ankle is not mostly vertical (standing is ~3.6 shoulder widths tall, a plank at most ~1.5 incl. front view).
      const reach = Math.abs(lm[s].x - ank.x) + dist(lm[11], lm[12]);
      if (Math.abs(ank.y - lm[s].y) > 2 * reach) { state.hMax = 0; return cycleScored(state, false, 0, 0, 1); }
      // Shoulder height above the planted wrist: foreshortening-proof, unlike the projected elbow angle.
      const h = lm[s + 4].y - lm[s].y;
      state.hMax = Math.max(state.hMax || 0, h);
      if (h <= 0) return false;
      const ratio = h / state.hMax; // 1 at the top, lower as the chest drops
      return cycleScored(state, ratio < 0.87, ratio, 0.87, 0.65);
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
      const sideMetric = (/** @type {string} */ side) => {
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
      // Front view: the hip angle stays ~180, but the torso's vertical extent collapses relative to the
      // thigh's (standing ~1.25, folded ~0.1); a ratio of vertical spans needs no torso scale.
      const thigh = (lm[25].y - lm[23].y) + (lm[26].y - lm[24].y);
      const trunk = (lm[23].y - lm[11].y) + (lm[24].y - lm[12].y);
      const ratio = thigh > 1e-5 ? trunk / thigh : 9;
      const active = avg < 100 || ratio < 0.6; // torso folded forward at the hips
      const t = Math.max(normT(avg, 100, 70), normT(ratio, 0.6, 0.3));
      return cycleScored(state, active, t, 0, 1);
    }
  };

  /**
   * @param {any} videoEl
   * @param {any} canvasEl
   * @param {any} [opts]
   */
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
    this.pose = new Pose({ locateFile: (/** @type {string} */ f) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${f}` });
    this.pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.6
    });
    this.pose.onResults((/** @type {any} */ res) => self._onResults(res));
  };

  /** @param {string} detectorKey */
  Tracker.prototype.setExercise = function (detectorKey) {
    this.currentDetectorKey = detectorKey;
    this.exState = freshState();
  };

  /** @param {boolean} on */
  Tracker.prototype.setEnabled = function (on) { this.enabled = on; };

  /** @param {any[]} raw */
  Tracker.prototype._smooth = function (raw) {
    const ALPHA = 0.5;
    if (!this.smoothed) {
      this.smoothed = raw.map((/** @type {any} */ p) => ({ x: p.x, y: p.y, z: p.z, visibility: p.visibility }));
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

  /** @param {any} results */
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
    const requiredVisible = this.currentDetectorKey === 'push_ups'
      ? (vis(lm, 11, 0.4) || vis(lm, 12, 0.4)) && (vis(lm, 23, 0.4) || vis(lm, 24, 0.4)) // far side is often hidden
      : visAll(lm, [11, 12, 23, 24], 0.4);
    const confColor = requiredVisible ? 'rgba(34,197,94,0.55)' : 'rgba(239,68,68,0.5)';

    drawConnectors(ctx, lm, POSE_CONNECTIONS, { color: confColor, lineWidth: 2 });
    drawLandmarks(ctx, lm, { color: '#f97316', lineWidth: 1, radius: 2.6 });

    if (this.opts.onConfidence) this.opts.onConfidence(requiredVisible);

    // Live limb-mirroring feed: fires whenever a confident pose is present,
    // independent of `enabled` (rep counting), so the character keeps
    // mirroring the user through rest periods and countdowns too.
    if (requiredVisible && this.opts.onFrame) this.opts.onFrame(computeLiveAngles(lm));

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
