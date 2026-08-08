'use strict';
require('../test-helpers/dom-shim');
const test = require('node:test');
const assert = require('node:assert/strict');

require('../js/tracker.js');
const { Store, computeStats } = global.BTB;

test.beforeEach(() => {
  global.localStorage.clear();
});

test('Store loads defaults when localStorage is empty', () => {
  const store = new Store();
  assert.equal(store.state.weight, 210);
  assert.equal(store.state.goalWeight, 175);
  assert.deepEqual(store.history, []);
});

test('Store.save() round-trips state and history through localStorage', () => {
  const store = new Store();
  store.state.weight = 190;
  store.recordDay({ day: 1, weight: 190, repsTotal: 42 });

  const reloaded = new Store();
  assert.equal(reloaded.state.weight, 190);
  assert.equal(reloaded.history.length, 1);
  assert.equal(reloaded.history[0].repsTotal, 42);
});

test('Store.recordDay caps history at 120 entries', () => {
  const store = new Store();
  for (let i = 0; i < 130; i++) {
    store.recordDay({ day: i, weight: 200, repsTotal: 10 });
  }
  assert.equal(store.history.length, 120);
  // oldest entries should have been shifted out, newest retained
  assert.equal(store.history[store.history.length - 1].day, 129);
});

test('Store.reset() restores defaults and clears history', () => {
  const store = new Store();
  store.state.weight = 150;
  store.recordDay({ day: 1, weight: 150, repsTotal: 5 });
  store.reset();
  assert.equal(store.state.weight, 210);
  assert.deepEqual(store.history, []);
});

test('computeStats derives lost/toGo/caloriesBurned correctly', () => {
  const store = new Store();
  store.state.startWeight = 210;
  store.state.weight = 195;
  store.state.goalWeight = 175;
  store.state.totalCaloriesBurned = 1234.6;
  const stats = computeStats(store);
  assert.equal(stats.lost, 15);
  assert.equal(stats.toGo, 20);
  assert.equal(stats.caloriesBurned, 1235);
});

test('exercisesTried and unlockedAchievements are independent per Store instance (no shared-reference aliasing)', () => {
  const a = new Store();
  a.markExerciseTried('squats');
  a.unlockAchievement('first_workout');

  const b = new Store();
  assert.deepEqual(b.state.exercisesTried, {});
  assert.deepEqual(b.state.unlockedAchievements, []);
});

test('unlockAchievement is idempotent', () => {
  const store = new Store();
  store.unlockAchievement('first_workout');
  store.unlockAchievement('first_workout');
  assert.deepEqual(store.state.unlockedAchievements, ['first_workout']);
});

test('computeStats clamps lost/toGo at 0 rather than going negative', () => {
  const store = new Store();
  store.state.startWeight = 210;
  store.state.weight = 220; // gained weight
  store.state.goalWeight = 230; // still above goal
  const stats = computeStats(store);
  assert.equal(stats.lost, 0);
  assert.equal(stats.toGo, 0);
});
