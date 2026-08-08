'use strict';
require('../test-helpers/dom-shim');
const test = require('node:test');
const assert = require('node:assert/strict');

require('../js/workouts.js');
const { buildWorkout, estimateCalories, kcalToLbs, lbsToKcal, Goals } = global.BTB;

test('buildWorkout is deterministic for a fixed seed', () => {
  const a = buildWorkout('weight_loss', 'moderate', 42);
  const b = buildWorkout('weight_loss', 'moderate', 42);
  assert.deepEqual(a.exercises.map(e => e.key), b.exercises.map(e => e.key));
  assert.deepEqual(a.exercises.map(e => e.reps), b.exercises.map(e => e.reps));
});

test('buildWorkout picks a different circuit for a different seed', () => {
  const a = buildWorkout('endurance', 'moderate', 1);
  const b = buildWorkout('endurance', 'moderate', 2);
  const same = a.exercises.map(e => e.key).join(',') === b.exercises.map(e => e.key).join(',');
  assert.equal(same, false);
});

test('buildWorkout returns exactly goal.count exercises for every goal', () => {
  for (const goalKey of Object.keys(Goals)) {
    const w = buildWorkout(goalKey, 'moderate', 7);
    assert.equal(w.exercises.length, Goals[goalKey].count);
  }
});

test('buildWorkout falls back to weight_loss/moderate for unknown keys', () => {
  const w = buildWorkout('not_a_goal', 'not_an_intensity', 3);
  assert.equal(w.goal.key, 'weight_loss');
  assert.equal(w.intensity.key, 'moderate');
});

test('estimateCalories matches kcal/min = MET * 3.5 * kg / 200', () => {
  const exercise = { met: 10, secPerRep: 6 };
  const reps = 10; // 6s * 10 reps = 60s = 1 minute exactly
  const bodyWeightLb = 200;
  const kg = bodyWeightLb * 0.453592;
  const expected = (10 * 3.5 * kg / 200) * 1;
  assert.ok(Math.abs(estimateCalories(exercise, reps, bodyWeightLb) - expected) < 1e-9);
});

test('kcalToLbs and lbsToKcal are exact inverses at the 3500 kcal/lb constant', () => {
  assert.equal(kcalToLbs(3500), 1);
  assert.equal(lbsToKcal(1), 3500);
  const lbs = 2.75;
  assert.ok(Math.abs(kcalToLbs(lbsToKcal(lbs)) - lbs) < 1e-9);
});
