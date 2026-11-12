'use strict';
require('../test-helpers/dom-shim');
const test = require('node:test');
const assert = require('node:assert/strict');

require('../js/workouts.js');
require('../js/pose-tracker.js');
const { buildWorkout, lbsToKcal, kcalToLbs } = global.BTB;
const { angleAt, midPt, dist, normAngleDelta, cycle } = global.BTB.PoseMath;
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

test('midPt and dist', () => {
  assert.deepEqual(midPt({ x: 1, y: 2 }, { x: 5, y: 10 }), { x: 3, y: 6 });
  assert.deepEqual(midPt({ x: -4, y: 0 }, { x: 4, y: 0 }), { x: 0, y: 0 });
  near(dist({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
});

test('angleAt: known angles, clamping and degenerate-vertex threshold', () => {
  near(angleAt({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 1 }), 45);
  near(angleAt({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: -1, y: 0 }), 180);
  near(angleAt({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 2, y: 0 }), 0);
  for (const s of [0.1, 0.3, 0.7, 1.3]) {
    const v = angleAt({ x: s, y: s }, { x: 0, y: 0 }, { x: 3 * s, y: 3 * s });
    assert.ok(!Number.isNaN(v));
    assert.ok(v < 1e-3);
  }
  const o = { x: 0, y: 0 };
  assert.equal(angleAt({ x: 5e-6, y: 0 }, o, { x: 1, y: 0 }), null);
  assert.equal(angleAt({ x: 1, y: 0 }, o, { x: 0, y: 5e-6 }), null);
  assert.notEqual(angleAt({ x: 1.5e-5, y: 0 }, o, { x: 1, y: 0 }), null);
  assert.notEqual(angleAt({ x: 1, y: 0 }, o, { x: 0, y: 1.5e-5 }), null);
});

test('normAngleDelta boundaries', () => {
  near(normAngleDelta(180), 180);
  near(normAngleDelta(-180), -180);
  near(normAngleDelta(181), -179);
  near(normAngleDelta(-181), 179);
  near(normAngleDelta(540), 180);
  near(normAngleDelta(-540), -180);
  near(normAngleDelta(360), 0);
  near(normAngleDelta(0), 0);
});

test('cycle: default 3-frame debounce both directions, custom hold', () => {
  const st = {};
  assert.equal(cycle(st, true), false);
  assert.equal(cycle(st, true), false);
  assert.equal(st.phase, 'rest');
  cycle(st, true);
  assert.equal(st.phase, 'active');
  assert.equal(cycle(st, false), false);
  assert.equal(cycle(st, false), false);
  assert.equal(st.phase, 'active');
  assert.equal(cycle(st, false), true);
  assert.equal(st.phase, 'rest');
  assert.equal(cycle(st, false), false);
  const s2 = {};
  assert.equal(cycle(s2, true, 1), false);
  assert.equal(s2.phase, 'active');
  assert.equal(cycle(s2, false, 1), true);
  // a noisy single rest frame resets the active hold
  const s3 = {};
  cycle(s3, true); cycle(s3, true); cycle(s3, false); cycle(s3, true);
  assert.equal(s3.phase, 'rest');
});

test('lbsToKcal / kcalToLbs use 3500 kcal per lb', () => {
  assert.equal(lbsToKcal(2), 7000);
  assert.equal(kcalToLbs(7000), 2);
  assert.equal(lbsToKcal(0.5), 1750);
});

test('buildWorkout rep rule across intensities', () => {
  const expected = { light: [7, 11], moderate: [10, 16], intense: [14, 22] };
  const seen = new Set();
  for (const [k, [base, fast]] of Object.entries(expected)) {
    for (let seed = 1; seed <= 60; seed++) {
      for (const g of ['weight_loss', 'endurance', 'toning', 'quick_cardio']) {
        for (const e of buildWorkout(g, k, seed).exercises) {
          const fastEx = e.key === 'high_knees' || e.key === 'side_reaches';
          assert.equal(e.reps, fastEx ? fast : base, `${g}/${k}/${e.key}`);
          if (fastEx) seen.add(e.key);
        }
      }
    }
  }
  assert.ok(seen.has('high_knees'));
});

test('buildWorkout: no exercise more than twice, correct length, determinism', () => {
  for (let seed = 1; seed <= 300; seed++) {
    for (const g of ['weight_loss', 'endurance', 'toning', 'quick_cardio']) {
      const w = buildWorkout(g, 'moderate', seed);
      assert.equal(w.exercises.length, w.goal.count);
      const c = {};
      for (const e of w.exercises) c[e.key] = (c[e.key] || 0) + 1;
      for (const n of Object.values(c)) assert.ok(n <= 2);
    }
  }
  const a = buildWorkout('endurance', 'intense', 42), b = buildWorkout('endurance', 'intense', 42);
  assert.deepEqual(a.exercises.map(e => e.key), b.exercises.map(e => e.key));
  assert.equal(buildWorkout('nope', 'nope', 3).intensity.key, 'moderate');
});
