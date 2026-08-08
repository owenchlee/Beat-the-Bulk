'use strict';
require('../test-helpers/dom-shim');
const test = require('node:test');
const assert = require('node:assert/strict');

require('../js/pose-tracker.js');
const { angleAt, normAngleDelta, cycle, freshState } = global.BTB.PoseMath;

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
