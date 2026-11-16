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

// buildWorkout is a seeded shuffle (goodnight/objective-make-the-fnai): deterministic per day,
// full count, each exercise at most twice, no back-to-back repeat, and a different order from yesterday.
test('buildWorkout is deterministic per day, uses each exercise at most twice, never repeats back-to-back', () => {
  for (const goalKey of Object.keys(Goals)) {
    for (let day = 2; day < 200; day++) { // day 0 is treated as day 1
      const keys = buildWorkout(goalKey, 'moderate', day).exercises.map(e => e.key);
      assert.deepEqual(buildWorkout(goalKey, 'moderate', day).exercises.map(e => e.key), keys);
      assert.equal(keys.length, Goals[goalKey].count);
      const counts = {};
      keys.forEach(k => { counts[k] = (counts[k] || 0) + 1; });
      assert.ok(Math.max(...Object.values(counts)) <= 2);
      keys.forEach((k, i) => assert.notEqual(k, keys[i + 1]));
      assert.notDeepEqual(keys, buildWorkout(goalKey, 'moderate', day - 1).exercises.map(e => e.key));
    }
  }
});
