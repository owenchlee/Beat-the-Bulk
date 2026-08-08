'use strict';
require('../test-helpers/dom-shim');
const test = require('node:test');
const assert = require('node:assert/strict');

require('../js/pose-tracker.js');
const { angleAt, normAngleDelta, cycle, freshState } = global.BTB.PoseMath;
const { squats } = global.BTB.Detectors;

test('angleAt returns 180 for collinear points', () => {
  const a = { x: 0, y: 0 }, b = { x: 1, y: 0 }, c = { x: 2, y: 0 };
  assert.ok(Math.abs(angleAt(a, b, c) - 180) < 1e-6);
});

test('angleAt returns 90 for a right angle', () => {
  const a = { x: 0, y: 1 }, b = { x: 0, y: 0 }, c = { x: 1, y: 0 };
  assert.ok(Math.abs(angleAt(a, b, c) - 90) < 1e-6);
});

test('angleAt returns null when a point coincides with the vertex', () => {
  const a = { x: 0, y: 0 }, b = { x: 0, y: 0 }, c = { x: 1, y: 0 };
  assert.equal(angleAt(a, b, c), null);
});

test('normAngleDelta wraps deltas into [-180, 180]', () => {
  assert.ok(Math.abs(normAngleDelta(270) - -90) < 1e-6);
  assert.ok(Math.abs(normAngleDelta(-270) - 90) < 1e-6);
  assert.ok(Math.abs(normAngleDelta(190) - -170) < 1e-6);
  assert.ok(Math.abs(normAngleDelta(45) - 45) < 1e-6);
});

test('cycle() fires exactly once per full rest->active->rest transition, respecting the hold-frame debounce', () => {
  const state = freshState();
  const results = [];
  const frames = [false, false, true, true, true, false, false, false];
  // holdFrames=3: 3 consecutive `true`s enter 'active', then 3 consecutive
  // `false`s complete the rep and fire exactly once, on the final frame.
  for (const activeNow of frames) {
    results.push(cycle(state, activeNow, 3));
  }
  assert.deepEqual(results, [false, false, false, false, false, false, false, true]);
});

test('cycle() never fires if activation never holds for the full debounce window', () => {
  const state = freshState();
  const results = [];
  // only 2 consecutive actives, holdFrames=3 -> never reaches 'active' phase
  const frames = [true, true, false, false, false, true, true, false, false, false];
  for (const activeNow of frames) {
    results.push(cycle(state, activeNow, 3));
  }
  assert.equal(results.some(Boolean), false);
});

test('cycle() supports a custom holdFrames debounce window', () => {
  const state = freshState();
  const results = [];
  const frames = [true, true, false, false];
  for (const activeNow of frames) {
    results.push(cycle(state, activeNow, 2));
  }
  assert.deepEqual(results, [false, false, false, true]);
});

// ---- Detectors: {done, formScore} contract (BTB.Detectors) ----

function legLandmarks(kneeAngleDeg) {
  // hip straight above knee straight above ankle = 180 degrees (standing).
  // Bending the ankle sideways under the knee by `kneeAngleDeg` from
  // straight lets us hit an exact target knee angle for the assertions.
  const lm = new Array(29).fill(null).map(() => ({ x: 0, y: 0, visibility: 1 }));
  const hip = { x: 0.4, y: 0.5 }, knee = { x: 0.4, y: 0.7 };
  const rad = (180 - kneeAngleDeg) * Math.PI / 180;
  const ankle = { x: knee.x + 0.2 * Math.sin(rad), y: knee.y + 0.2 * Math.cos(rad) };
  lm[23] = { ...hip, visibility: 1 };
  lm[24] = { ...hip, visibility: 1 };
  lm[25] = { ...knee, visibility: 1 };
  lm[26] = { ...knee, visibility: 1 };
  lm[27] = { ...ankle, visibility: 1 };
  lm[28] = { ...ankle, visibility: 1 };
  return lm;
}

test('squats returns false (not just falsy 0/undefined) while resting or mid-rep', () => {
  const state = freshState();
  const standing = legLandmarks(180);
  assert.equal(squats(standing, state, 1), false);
  assert.equal(squats(standing, state, 1), false);
});

test('squats returns {done: true, formScore} on rep completion, scoring depth reached', () => {
  const state = freshState();
  const bent = legLandmarks(90); // at the 90-degree target depth
  const standing = legLandmarks(180);
  // 3 frames bent enters 'active' (holdFrames=3), 3 frames standing completes the rep
  squats(bent, state, 1); squats(bent, state, 1); squats(bent, state, 1);
  squats(standing, state, 1); squats(standing, state, 1);
  const result = squats(standing, state, 1);
  assert.deepEqual(result, { done: true, formScore: 100 });
});

test('squats scores a shallow rep lower than a full-depth rep', () => {
  const shallowState = freshState();
  const shallow = legLandmarks(125); // just past the 130-degree threshold, far from the 90-degree target
  const standing = legLandmarks(180);
  squats(shallow, shallowState, 1); squats(shallow, shallowState, 1); squats(shallow, shallowState, 1);
  squats(standing, shallowState, 1); squats(standing, shallowState, 1);
  const shallowResult = squats(standing, shallowState, 1);

  const deepState = freshState();
  const deep = legLandmarks(90);
  squats(deep, deepState, 1); squats(deep, deepState, 1); squats(deep, deepState, 1);
  squats(standing, deepState, 1); squats(standing, deepState, 1);
  const deepResult = squats(standing, deepState, 1);

  assert.ok(shallowResult.formScore < deepResult.formScore);
});
