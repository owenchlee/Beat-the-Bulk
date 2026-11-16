'use strict';
require('../test-helpers/dom-shim');
const test = require('node:test');
const assert = require('node:assert/strict');

require('../js/tracker.js');
require('../js/workouts.js');
require('../js/pose-tracker.js');
const { angleAt } = global.BTB.PoseMath;
const { buildWorkout, Goals } = global.BTB;

test('angleAt treats the second ray of length exactly 1e-5 as valid', () => {
  const a = { x: 0, y: 1 }, b = { x: 0, y: 0 }, c = { x: 1e-5, y: 0 };
  assert.ok(Math.abs(angleAt(a, b, c) - 90) < 1e-6);
});

// Documented: seeded LCG (seed = day*137+17; next = (seed*1664525+1013904223) & 0x7fffffff).
function reference(goalKey, daySeed) {
  const goal = Goals[goalKey];
  let seed = (daySeed || 1) * 137 + 17;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) & 0x7fffffff; return seed; };
  const seen = {}, out = [];
  for (let g = 0; out.length < goal.count && g < 200; g++) {
    const k = goal.pool[rnd() % goal.pool.length];
    if ((seen[k] || 0) < 2) { seen[k] = (seen[k] || 0) + 1; out.push(k); }
  }
  return out;
}

test('buildWorkout follows the seeded LCG and uses each exercise at most twice', () => {
  for (const goalKey of Object.keys(Goals)) {
    for (let day = 0; day < 200; day++) {
      const keys = buildWorkout(goalKey, 'moderate', day).exercises.map(e => e.key);
      assert.deepEqual(keys, reference(goalKey, day));
      const counts = {};
      keys.forEach(k => { counts[k] = (counts[k] || 0) + 1; });
      assert.ok(Math.max(...Object.values(counts)) <= 2);
    }
  }
});
