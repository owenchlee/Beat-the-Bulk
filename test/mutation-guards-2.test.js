'use strict';
require('../test-helpers/dom-shim');
const test = require('node:test');
const assert = require('node:assert/strict');

require('../js/tracker.js');
require('../js/workouts.js');
require('../js/pose-tracker.js');
const { angleAt, dist, cycle, freshState } = global.BTB.PoseMath;
const { squats } = global.BTB.Detectors;
const { buildWorkout, estimateCalories, Goals } = global.BTB;

test('angleAt clamps rounding error so identical / opposite rays give 0 and 180, not NaN', () => {
  const x = 0.0010030090270812437, y = 0.006910167818361303;
  const o = { x: 0, y: 0 };
  assert.equal(angleAt({ x, y }, o, { x, y }), 0);
  assert.ok(Math.abs(angleAt({ x, y }, o, { x: -x, y: -y }) - 180) < 1e-6);
});

test('angleAt treats a ray of length exactly 1e-5 as valid', () => {
  const a = { x: 1e-5, y: 0 }, b = { x: 0, y: 0 }, c = { x: 0, y: 1 };
  assert.ok(Math.abs(angleAt(a, b, c) - 90) < 1e-6);
});

test('dist is the euclidean distance', () => {
  assert.equal(dist({ x: 1, y: 1 }, { x: 4, y: 5 }), 5);
  assert.equal(dist({ x: 4, y: 5 }, { x: 1, y: 1 }), 5);
});

function standingBent(vis) {
  const lm = new Array(29).fill(null).map(() => ({ x: 0, y: 0, visibility: vis }));
  const hip = { x: 0.4, y: 0.5 }, knee = { x: 0.4, y: 0.7 }, ankle = { x: 0.6, y: 0.7 }; // 90 deg
  [[23, hip], [24, hip], [25, knee], [26, knee], [27, ankle], [28, ankle]].forEach(([i, p]) => { lm[i] = { ...p, visibility: vis }; });
  return lm;
}
function repCompletes(bent, standing) {
  const s = freshState();
  const out = [];
  for (let i = 0; i < 3; i++) out.push(squats(bent, s, 1));
  for (let i = 0; i < 3; i++) out.push(squats(standing, s, 1));
  return out.some(r => r && r.done);
}

test('landmark visibility must be strictly greater than 0.45 to count', () => {
  const standing = standingBent(1).map((p, i) => ({ ...p }));
  standing[25] = { x: 0.4, y: 0.7, visibility: 1 }; standing[27] = { x: 0.4, y: 0.9, visibility: 1 };
  standing[26] = standing[25]; standing[28] = standing[27];
  assert.equal(repCompletes(standingBent(1), standing), true);
  assert.equal(repCompletes(standingBent(0.45), standing), false);
});

test('landmarks without a visibility value or missing entirely are not visible', () => {
  const noVis = standingBent(1).map(p => ({ x: p.x, y: p.y }));
  assert.equal(repCompletes(noVis, noVis), false);
  const missing = standingBent(1); missing[25] = null;
  assert.doesNotThrow(() => squats(missing, freshState(), 1));
  assert.equal(squats(missing, freshState(), 1), false);
});

test('buildWorkout never repeats an exercise more than twice', () => {
  for (const g of Object.keys(Goals)) for (let d = 1; d <= 60; d++) {
    const counts = {};
    buildWorkout(g, 'moderate', d).exercises.forEach(e => { counts[e.key || e.name] = (counts[e.key || e.name] || 0) + 1; });
    assert.ok(Math.max(...Object.values(counts)) <= 2, `${g} day ${d}`);
  }
});

test('estimateCalories multiplies kcal/min by minutes', () => {
  const ex = { met: 8, secPerRep: 3 };
  const kg = 150 * 0.453592;
  assert.ok(Math.abs(estimateCalories(ex, 40, 150) - (8 * 3.5 * kg / 200) * 2) < 1e-9);
});

test('markExerciseTried records true and survives a save/load round trip', () => {
  const { Store } = global.BTB;
  global.localStorage.clear();
  const s = new Store();
  s.markExerciseTried('squats');
  assert.equal(s.state.exercisesTried.squats, true);
  s.save();
  assert.equal(new Store().state.exercisesTried.squats, true);
});
