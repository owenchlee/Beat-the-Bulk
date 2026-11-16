/* ============================================================
   BEAT THE BULK — Exercise pool, workout plans, calorie math
   Calorie burn uses real MET (Metabolic Equivalent of Task)
   coefficients: kcal/min = MET * 3.5 * bodyWeightKg / 200.
   Weight change (loss from exercise, gain from food) both use
   the same real-world constant: 3500 kcal ≈ 1 lb. Exception: weight lost per rep is multiplied by BURN_GAME_SCALE so a workout can outweigh dinner.
   ============================================================ */

/**
 * @typedef {Object} ExerciseDef
 * @property {string} key
 * @property {string} name
 * @property {number} met - Metabolic Equivalent of Task coefficient.
 * @property {number} secPerRep
 * @property {string[]} tags
 * @property {string} tip
 * @property {function(number): void} demo - Renders demo phase 0/1 into #demoSvg.
 */

/**
 * @typedef {Object} QueuedExercise
 * @property {string} key
 * @property {string} name
 * @property {number} met
 * @property {number} secPerRep
 * @property {string[]} tags
 * @property {string} tip
 * @property {function(number): void} demo
 * @property {number} reps - Reps assigned for this workout instance.
 * @property {Object} state - Fresh per-exercise detector state.
 */

/**
 * @typedef {Object} Goal
 * @property {string} key
 * @property {string} label
 * @property {string} desc
 * @property {string[]} pool - Exercise keys this goal draws from.
 * @property {number} count - Number of exercises in a built workout.
 * @property {string} iconKey
 */

/**
 * @typedef {Object} Intensity
 * @property {string} key
 * @property {string} label
 * @property {number} repsMult
 * @property {number} restSec
 * @property {string} desc
 */

/**
 * @typedef {Object} Workout
 * @property {Goal} goal
 * @property {Intensity} intensity
 * @property {QueuedExercise[]} exercises
 */

(function (global) {
  /** @type {Record<string, any>} */
  const EXERCISES = {
    jumping_jacks: {
      key: 'jumping_jacks', name: 'Jumping Jacks', met: 8, secPerRep: 1.1,
      tags: ['Cardio', 'Full Body'],
      tip: 'Jump feet wide while raising both arms overhead, then back to start. Each full cycle counts.',
      demo: demoJJ
    },
    overhead_press: {
      key: 'overhead_press', name: 'Overhead Reaches', met: 3.5, secPerRep: 1.6,
      tags: ['Arms', 'Shoulders'],
      tip: 'Raise both hands straight above your head, then lower back to shoulder height.',
      demo: demoOverhead
    },
    squats: {
      key: 'squats', name: 'Squats', met: 5, secPerRep: 2.2,
      tags: ['Legs', 'Core'],
      tip: 'Feet shoulder-width apart. Bend your knees until thighs are near parallel, then stand.',
      demo: demoSquat
    },
    side_reaches: {
      key: 'side_reaches', name: 'Side Reaches', met: 2.5, secPerRep: 1.4,
      tags: ['Flexibility', 'Core'],
      tip: 'Reach one arm down the side of your leg toward the floor. Alternating sides each count.',
      demo: demoSideReach
    },
    high_knees: {
      key: 'high_knees', name: 'High Knees', met: 8, secPerRep: 0.55,
      tags: ['Cardio', 'Legs'],
      tip: 'March in place, driving each knee up toward hip height. Each leg lift counts.',
      demo: demoHighKnee
    },
    arm_circles: {
      key: 'arm_circles', name: 'Arm Circles', met: 3, secPerRep: 1.1,
      tags: ['Warm-up', 'Shoulders'],
      tip: 'Stretch arms out wide and draw big circles. Each full rotation counts.',
      demo: demoArmCircle
    },
    push_ups: {
      key: 'push_ups', name: 'Push-Ups', met: 8, secPerRep: 2.0,
      tags: ['Strength', 'Arms'],
      tip: 'Hands under shoulders, lower your chest down, then press back up. (Knee push-ups count too!)',
      demo: demoPushup
    },
    lunges: {
      key: 'lunges', name: 'Lunges', met: 4, secPerRep: 2.4,
      tags: ['Legs', 'Balance'],
      tip: 'Step forward and bend both knees to about 90°, then push back to standing. Alternate legs.',
      demo: demoLunge
    },
    bicep_curls: {
      key: 'bicep_curls', name: 'Bicep Curls', met: 3.5, secPerRep: 1.8,
      tags: ['Arms', 'Strength'],
      tip: 'Elbows at your sides, curl both hands up toward your shoulders, then lower back down.',
      demo: demoBicepCurl
    },
    lateral_raises: {
      key: 'lateral_raises', name: 'Lateral Raises', met: 3, secPerRep: 1.6,
      tags: ['Arms', 'Shoulders'],
      tip: 'Raise both arms out to the sides until they reach shoulder height, then lower back down.',
      demo: demoLateralRaise
    },
    toe_touches: {
      key: 'toe_touches', name: 'Toe Touches', met: 3.5, secPerRep: 1.8,
      tags: ['Flexibility', 'Core'],
      tip: 'Keep your legs fairly straight and bend forward at the hips, reaching toward your toes.',
      demo: demoToeTouch
    }
  };

  /** @type {Record<string, any>} */
  const GOALS = {
    weight_loss: {
      key: 'weight_loss', label: 'Weight Loss', desc: 'Cardio-heavy circuit to maximize calorie burn.',
      pool: ['jumping_jacks', 'high_knees', 'squats', 'lunges', 'jumping_jacks'], count: 5, iconKey: 'flame'
    },
    endurance: {
      key: 'endurance', label: 'Endurance', desc: 'Steady mixed circuit to build stamina.',
      pool: ['jumping_jacks', 'high_knees', 'squats', 'overhead_press', 'arm_circles', 'toe_touches', 'side_reaches'], count: 5, iconKey: 'heart'
    },
    toning: {
      key: 'toning', label: 'Toning', desc: 'Strength-focused moves for muscle definition.',
      pool: ['squats', 'push_ups', 'lunges', 'overhead_press', 'bicep_curls', 'lateral_raises'], count: 4, iconKey: 'bolt'
    },
    quick_cardio: {
      key: 'quick_cardio', label: 'Quick Cardio', desc: 'Short, high-energy burst when you\'re short on time.',
      pool: ['jumping_jacks', 'high_knees', 'arm_circles'], count: 3, iconKey: 'clock'
    }
  };

  /** @type {Record<string, any>} */
  const INTENSITIES = {
    light: { key: 'light', label: 'Light', repsMult: 0.7, restSec: 20, desc: 'Easy pace, great for beginners' },
    moderate: { key: 'moderate', label: 'Moderate', repsMult: 1.0, restSec: 15, desc: 'Balanced, steady effort' },
    intense: { key: 'intense', label: 'Intense', repsMult: 1.4, restSec: 10, desc: 'Max effort, less rest' }
  };

  const BASE_REPS = 10;

  /**
   * Builds a deterministic circuit of exercises for a given goal/intensity/day.
   * Same (goalKey, intensityKey, daySeed) always yields the same exercise
   * list and rep counts (seeded LCG), so a day's workout is reproducible.
   * @param {string} goalKey
   * @param {string} intensityKey
   * @param {number} daySeed
   * @returns {Workout}
   */
  function buildWorkout(goalKey, intensityKey, daySeed) {
    const goal = GOALS[goalKey] || GOALS.weight_loss;
    const intensity = INTENSITIES[intensityKey] || INTENSITIES.moderate;
    // Distinct pool, shuffled by a seeded mulberry32; a repeat is added only when the pool is smaller than count.
    function order(day) {
      let t = (Math.trunc(Number(day)) || 1) * 2654435761 + 17;
      const rnd = function () {
        t = (t + 0x6D2B79F5) | 0;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
      };
      const keys = goal.pool.filter(function (k, i, a) { return a.indexOf(k) === i; });
      for (let i = keys.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        const tmp = keys[i]; keys[i] = keys[j]; keys[j] = tmp;
      }
      const out = keys.slice(0, goal.count);
      for (let guard = 0; out.length < goal.count && guard < 200; guard++) {
        const key = goal.pool[Math.floor(rnd() * goal.pool.length)]; // weighted by pool duplicates
        const spots = [];
        for (let p = 0; p <= out.length; p++) if (out[p - 1] !== key && out[p] !== key) spots.push(p);
        if (spots.length && out.filter(function (k) { return k === key; }).length < 2) out.splice(spots[Math.floor(rnd() * spots.length)], 0, key);
      }
      return out;
    }
    // rotate so consecutive days never share the exact same order (compares against yesterday's final order, a few days deep)
    function final(day, depth) {
      let k = order(day);
      const other = depth > 0 ? final(day - 1, depth - 1).join() : order(day - 1).join();
      for (let n = 0; n < k.length && k.join() === other; n++) k = k.slice(1).concat(k[0]);
      return k;
    }
    const keys = final(Math.trunc(Number(daySeed)) || 1, 6);
    const chosen = keys.map(function (key) {
      const reps = Math.max(6, Math.round(BASE_REPS * intensity.repsMult * (key === 'high_knees' || key === 'side_reaches' ? 1.6 : 1)));
      return Object.assign({}, EXERCISES[key], { reps, state: {} });
    });
    return { goal, intensity, exercises: chosen };
  }

  /**
   * @param {{met: number, secPerRep: number}} exercise
   * @param {number} reps
   * @param {number} bodyWeightLb
   * @returns {number} Estimated kcal burned.
   */
  function estimateCalories(exercise, reps, bodyWeightLb) {
    const kg = Math.max(0, Number(bodyWeightLb) || 0) * 0.453592;
    const minutes = (exercise.secPerRep * Math.max(0, Number(reps) || 0)) / 60;
    const kcalPerMin = exercise.met * 3.5 * kg / 200;
    return kcalPerMin * minutes;
  }

  /** @param {number} kcal @returns {number} */
  function kcalToLbs(kcal) { return kcal / 3500; }
  /** Game-scale factor: a rep's real burn is tiny, so weight loss per rep is exaggerated this many times (displayed kcal stay honest). */
  const BURN_GAME_SCALE = 300;
  /** @param {number} lbs @returns {number} */
  function lbsToKcal(lbs) { return lbs * 3500; }

  // ---- Compact stick-figure demo renderer (used in the exercise preview card) ----
  /**
   * @param {number} headCy
   * @param {number} bodyLen
   * @param {number} lArmAngle
   * @param {number} rArmAngle
   * @param {number} lLegAngle
   * @param {number} rLegAngle
   */
  function stick(headCy, bodyLen, lArmAngle, rArmAngle, lLegAngle, rLegAngle) {
    const r = 10, nY = headCy + r, bY = nY + bodyLen;
    const la = lArmAngle * Math.PI / 180, ra = rArmAngle * Math.PI / 180;
    const ll = lLegAngle * Math.PI / 180, rl = rLegAngle * Math.PI / 180;
    return `
      <circle cx="45" cy="${headCy}" r="${r}" fill="#ffd4a3" stroke="#c98452" stroke-width="1.5"/>
      <line x1="45" y1="${nY}" x2="45" y2="${bY}" stroke="#f97316" stroke-width="4" stroke-linecap="round"/>
      <line x1="45" y1="${nY + 6}" x2="${45 + 22 * Math.cos(la)}" y2="${nY + 6 - 22 * Math.sin(la)}" stroke="#f97316" stroke-width="3" stroke-linecap="round"/>
      <line x1="45" y1="${nY + 6}" x2="${45 + 22 * Math.cos(ra)}" y2="${nY + 6 - 22 * Math.sin(ra)}" stroke="#f97316" stroke-width="3" stroke-linecap="round"/>
      <line x1="45" y1="${bY}" x2="${45 + 22 * Math.cos(ll)}" y2="${bY + 22 * Math.sin(ll)}" stroke="#22c55e" stroke-width="3.5" stroke-linecap="round"/>
      <line x1="45" y1="${bY}" x2="${45 + 22 * Math.cos(rl)}" y2="${bY + 22 * Math.sin(rl)}" stroke="#22c55e" stroke-width="3.5" stroke-linecap="round"/>
    `;
  }
  /** @param {string} html */
  function setDemo(html) { const e = document.getElementById('demoSvg'); if (e) e.innerHTML = html; }

  /** @param {number} ph */
  function demoJJ(ph) { setDemo(ph === 0 ? stick(18, 28, 210, 330, 120, 60) : stick(18, 28, 135, 45, 150, 30)); }
  /** @param {number} ph */
  function demoOverhead(ph) { setDemo(ph === 0 ? stick(18, 30, 200, 340, 110, 70) : stick(18, 30, 90, 90, 110, 70)); }
  /** @param {number} ph */
  function demoSquat(ph) {
    setDemo(ph === 0 ? stick(14, 32, 200, 340, 110, 70) : `
      <circle cx="45" cy="38" r="10" fill="#ffd4a3" stroke="#c98452" stroke-width="1.5"/>
      <line x1="45" y1="48" x2="45" y2="64" stroke="#f97316" stroke-width="4" stroke-linecap="round"/>
      <line x1="45" y1="54" x2="22" y2="46" stroke="#f97316" stroke-width="3" stroke-linecap="round"/>
      <line x1="45" y1="54" x2="68" y2="46" stroke="#f97316" stroke-width="3" stroke-linecap="round"/>
      <line x1="45" y1="64" x2="24" y2="84" stroke="#22c55e" stroke-width="3.5" stroke-linecap="round"/>
      <line x1="45" y1="64" x2="66" y2="84" stroke="#22c55e" stroke-width="3.5" stroke-linecap="round"/>`);
  }
  /** @param {number} ph */
  function demoSideReach(ph) {
    setDemo(ph === 0 ? `
      <circle cx="45" cy="18" r="10" fill="#ffd4a3" stroke="#c98452" stroke-width="1.5"/>
      <line x1="45" y1="28" x2="45" y2="58" stroke="#f97316" stroke-width="4" stroke-linecap="round"/>
      <line x1="45" y1="35" x2="70" y2="50" stroke="#f97316" stroke-width="3" stroke-linecap="round"/>
      <line x1="45" y1="35" x2="12" y2="26" stroke="#f97316" stroke-width="3" stroke-linecap="round"/>
      <line x1="45" y1="58" x2="33" y2="82" stroke="#22c55e" stroke-width="3.5" stroke-linecap="round"/>
      <line x1="45" y1="58" x2="57" y2="82" stroke="#22c55e" stroke-width="3.5" stroke-linecap="round"/>` : `
      <circle cx="45" cy="18" r="10" fill="#ffd4a3" stroke="#c98452" stroke-width="1.5"/>
      <line x1="45" y1="28" x2="45" y2="58" stroke="#f97316" stroke-width="4" stroke-linecap="round"/>
      <line x1="45" y1="35" x2="78" y2="26" stroke="#f97316" stroke-width="3" stroke-linecap="round"/>
      <line x1="45" y1="35" x2="20" y2="50" stroke="#f97316" stroke-width="3" stroke-linecap="round"/>
      <line x1="45" y1="58" x2="33" y2="82" stroke="#22c55e" stroke-width="3.5" stroke-linecap="round"/>
      <line x1="45" y1="58" x2="57" y2="82" stroke="#22c55e" stroke-width="3.5" stroke-linecap="round"/>`);
  }
  /** @param {number} ph */
  function demoHighKnee(ph) {
    setDemo(ph === 0 ? `
      <circle cx="45" cy="16" r="10" fill="#ffd4a3" stroke="#c98452" stroke-width="1.5"/>
      <line x1="45" y1="26" x2="45" y2="54" stroke="#f97316" stroke-width="4" stroke-linecap="round"/>
      <line x1="45" y1="33" x2="24" y2="42" stroke="#f97316" stroke-width="3" stroke-linecap="round"/>
      <line x1="45" y1="33" x2="66" y2="42" stroke="#f97316" stroke-width="3" stroke-linecap="round"/>
      <line x1="45" y1="54" x2="32" y2="44" stroke="#22c55e" stroke-width="3.5" stroke-linecap="round"/>
      <line x1="32" y1="44" x2="28" y2="62" stroke="#22c55e" stroke-width="3" stroke-linecap="round"/>
      <line x1="45" y1="54" x2="57" y2="80" stroke="#22c55e" stroke-width="3.5" stroke-linecap="round"/>` : `
      <circle cx="45" cy="16" r="10" fill="#ffd4a3" stroke="#c98452" stroke-width="1.5"/>
      <line x1="45" y1="26" x2="45" y2="54" stroke="#f97316" stroke-width="4" stroke-linecap="round"/>
      <line x1="45" y1="33" x2="24" y2="42" stroke="#f97316" stroke-width="3" stroke-linecap="round"/>
      <line x1="45" y1="33" x2="66" y2="42" stroke="#f97316" stroke-width="3" stroke-linecap="round"/>
      <line x1="45" y1="54" x2="33" y2="80" stroke="#22c55e" stroke-width="3.5" stroke-linecap="round"/>
      <line x1="45" y1="54" x2="58" y2="44" stroke="#22c55e" stroke-width="3.5" stroke-linecap="round"/>
      <line x1="58" y1="44" x2="62" y2="62" stroke="#22c55e" stroke-width="3" stroke-linecap="round"/>`);
  }
  /** @param {number} ph */
  function demoArmCircle(ph) {
    setDemo(ph === 0 ? `
      <circle cx="45" cy="18" r="10" fill="#ffd4a3" stroke="#c98452" stroke-width="1.5"/>
      <line x1="45" y1="28" x2="45" y2="56" stroke="#f97316" stroke-width="4" stroke-linecap="round"/>
      <line x1="45" y1="35" x2="14" y2="24" stroke="#f97316" stroke-width="3" stroke-linecap="round"/>
      <line x1="45" y1="35" x2="76" y2="50" stroke="#f97316" stroke-width="3" stroke-linecap="round"/>
      <line x1="45" y1="56" x2="33" y2="80" stroke="#22c55e" stroke-width="3.5" stroke-linecap="round"/>
      <line x1="45" y1="56" x2="57" y2="80" stroke="#22c55e" stroke-width="3.5" stroke-linecap="round"/>
      <path d="M14 28 Q6 16 18 10" stroke="#fbbf24" stroke-width="2" fill="none" stroke-dasharray="3 2" stroke-linecap="round"/>` : `
      <circle cx="45" cy="18" r="10" fill="#ffd4a3" stroke="#c98452" stroke-width="1.5"/>
      <line x1="45" y1="28" x2="45" y2="56" stroke="#f97316" stroke-width="4" stroke-linecap="round"/>
      <line x1="45" y1="35" x2="14" y2="48" stroke="#f97316" stroke-width="3" stroke-linecap="round"/>
      <line x1="45" y1="35" x2="76" y2="22" stroke="#f97316" stroke-width="3" stroke-linecap="round"/>
      <line x1="45" y1="56" x2="33" y2="80" stroke="#22c55e" stroke-width="3.5" stroke-linecap="round"/>
      <line x1="45" y1="56" x2="57" y2="80" stroke="#22c55e" stroke-width="3.5" stroke-linecap="round"/>
      <path d="M76 28 Q84 40 72 48" stroke="#fbbf24" stroke-width="2" fill="none" stroke-dasharray="3 2" stroke-linecap="round"/>`);
  }
  /** @param {number} ph */
  function demoPushup(ph) {
    setDemo(ph === 0 ? `
      <circle cx="18" cy="70" r="9" fill="#ffd4a3" stroke="#c98452" stroke-width="1.5"/>
      <line x1="26" y1="70" x2="74" y2="70" stroke="#f97316" stroke-width="5" stroke-linecap="round"/>
      <line x1="30" y1="70" x2="30" y2="90" stroke="#f97316" stroke-width="3" stroke-linecap="round"/>
      <line x1="70" y1="70" x2="70" y2="90" stroke="#22c55e" stroke-width="3.5" stroke-linecap="round"/>` : `
      <circle cx="16" cy="52" r="9" fill="#ffd4a3" stroke="#c98452" stroke-width="1.5"/>
      <line x1="24" y1="55" x2="74" y2="70" stroke="#f97316" stroke-width="5" stroke-linecap="round"/>
      <line x1="30" y1="58" x2="42" y2="90" stroke="#f97316" stroke-width="3" stroke-linecap="round"/>
      <line x1="70" y1="70" x2="70" y2="90" stroke="#22c55e" stroke-width="3.5" stroke-linecap="round"/>`);
  }
  /** @param {number} ph */
  function demoLunge(ph) {
    setDemo(ph === 0 ? stick(14, 30, 190, 350, 100, 80) : `
      <circle cx="45" cy="16" r="10" fill="#ffd4a3" stroke="#c98452" stroke-width="1.5"/>
      <line x1="45" y1="26" x2="45" y2="52" stroke="#f97316" stroke-width="4" stroke-linecap="round"/>
      <line x1="45" y1="33" x2="24" y2="26" stroke="#f97316" stroke-width="3" stroke-linecap="round"/>
      <line x1="45" y1="33" x2="66" y2="26" stroke="#f97316" stroke-width="3" stroke-linecap="round"/>
      <line x1="45" y1="52" x2="20" y2="60" stroke="#22c55e" stroke-width="3.5" stroke-linecap="round"/>
      <line x1="20" y1="60" x2="20" y2="86" stroke="#22c55e" stroke-width="3" stroke-linecap="round"/>
      <line x1="45" y1="52" x2="68" y2="66" stroke="#22c55e" stroke-width="3.5" stroke-linecap="round"/>
      <line x1="68" y1="66" x2="60" y2="88" stroke="#22c55e" stroke-width="3" stroke-linecap="round"/>`);
  }
  /** @param {number} ph */
  function demoBicepCurl(ph) { setDemo(ph === 0 ? stick(18, 30, 200, 340, 110, 70) : stick(18, 30, 120, 60, 110, 70)); }
  /** @param {number} ph */
  function demoLateralRaise(ph) { setDemo(ph === 0 ? stick(18, 30, 200, 340, 110, 70) : stick(18, 30, 175, 5, 110, 70)); }
  /** @param {number} ph */
  function demoToeTouch(ph) {
    setDemo(ph === 0 ? `
      <circle cx="45" cy="16" r="10" fill="#ffd4a3" stroke="#c98452" stroke-width="1.5"/>
      <line x1="45" y1="26" x2="45" y2="58" stroke="#f97316" stroke-width="4" stroke-linecap="round"/>
      <line x1="45" y1="33" x2="30" y2="50" stroke="#f97316" stroke-width="3" stroke-linecap="round"/>
      <line x1="45" y1="33" x2="60" y2="50" stroke="#f97316" stroke-width="3" stroke-linecap="round"/>
      <line x1="45" y1="58" x2="34" y2="86" stroke="#22c55e" stroke-width="3.5" stroke-linecap="round"/>
      <line x1="45" y1="58" x2="56" y2="86" stroke="#22c55e" stroke-width="3.5" stroke-linecap="round"/>` : `
      <circle cx="45" cy="72" r="9" fill="#ffd4a3" stroke="#c98452" stroke-width="1.5"/>
      <line x1="45" y1="58" x2="45" y2="64" stroke="#f97316" stroke-width="4" stroke-linecap="round"/>
      <line x1="45" y1="60" x2="36" y2="84" stroke="#f97316" stroke-width="3" stroke-linecap="round"/>
      <line x1="45" y1="60" x2="54" y2="84" stroke="#f97316" stroke-width="3" stroke-linecap="round"/>
      <line x1="45" y1="58" x2="34" y2="86" stroke="#22c55e" stroke-width="3.5" stroke-linecap="round"/>
      <line x1="45" y1="58" x2="56" y2="86" stroke="#22c55e" stroke-width="3.5" stroke-linecap="round"/>`);
  }

  global.BTB = global.BTB || {};
  global.BTB.Exercises = EXERCISES;
  global.BTB.Goals = GOALS;
  global.BTB.Intensities = INTENSITIES;
  global.BTB.buildWorkout = buildWorkout;
  global.BTB.estimateCalories = estimateCalories;
  global.BTB.kcalToLbs = kcalToLbs;
  global.BTB.BURN_GAME_SCALE = BURN_GAME_SCALE;
  global.BTB.lbsToKcal = lbsToKcal;
})(window);
