/* ============================================================
   BEAT THE BULK — Achievements
   A catalog of unlockable badges checked against Store state
   (and, for a couple, the just-finished session) — reuses the
   same toast/confetti celebration idiom as weight milestones.
   ============================================================ */

/**
 * @typedef {Object} Achievement
 * @property {string} id
 * @property {string} name
 * @property {string} desc
 * @property {string} iconKey
 * @property {function(any, any=): boolean} check
 */

(function (global) {
  /** @type {Achievement[]} */
  const ACHIEVEMENTS = [
    {
      id: 'first_workout', name: 'First Steps', desc: 'Complete your first workout.', iconKey: 'trophy',
      check: store => store.state.totalWorkouts >= 1
    },
    {
      id: 'streak_3', name: 'On a Roll', desc: 'Reach a 3-day streak.', iconKey: 'flame',
      check: store => store.state.streak >= 3
    },
    {
      id: 'streak_7', name: 'Full Week', desc: 'Reach a 7-day streak.', iconKey: 'flame',
      check: store => store.state.streak >= 7
    },
    {
      id: 'century_reps', name: 'Century Club', desc: 'Log 100 total reps.', iconKey: 'dumbbell',
      check: store => store.state.totalReps >= 100
    },
    {
      id: 'rep_machine', name: 'Rep Machine', desc: 'Log 500 total reps.', iconKey: 'dumbbell',
      check: store => store.state.totalReps >= 500
    },
    {
      id: 'ten_workouts', name: 'Dedicated', desc: 'Complete 10 workouts.', iconKey: 'check',
      check: store => store.state.totalWorkouts >= 10
    },
    {
      id: 'calorie_crusher', name: 'Calorie Crusher', desc: 'Burn 1,000 calories total.', iconKey: 'flame',
      check: store => store.state.totalCaloriesBurned >= 1000
    },
    {
      id: 'goal_crushed', name: 'Goal Crushed', desc: 'Reach your goal weight.', iconKey: 'target',
      check: store => store.state.weight <= store.state.goalWeight
    },
    {
      id: 'well_rounded', name: 'Well Rounded', desc: 'Try every exercise at least once.', iconKey: 'sparkle',
      check: store => {
        const tried = store.state.exercisesTried || {};
        const allKeys = Object.keys((global.BTB && global.BTB.Exercises) || {});
        return allKeys.length > 0 && allKeys.every(k => tried[k]);
      }
    },
    {
      id: 'perfect_form', name: 'Picture Perfect', desc: 'Average a 95+ form score in a workout.', iconKey: 'sparkle',
      check: (store, session) => !!session && session.formScoreCount > 0 && (session.formScoreSum / session.formScoreCount) >= 95
    }
  ];

  /**
   * Checks every not-yet-unlocked achievement, unlocking (and persisting via
   * store.unlockAchievement) any that now pass. Safe to call from multiple
   * points in a workout — already-unlocked achievements are skipped, so
   * nothing double-fires.
   * @param {any} store - A BTB.Store instance.
   * @param {Object} [session]
   * @returns {Achievement[]} Newly unlocked achievements, in catalog order.
   */
  function evaluateAchievements(store, session) {
    const unlocked = store.state.unlockedAchievements || [];
    const newly = [];
    for (const a of ACHIEVEMENTS) {
      if (unlocked.includes(a.id)) continue;
      if (a.check(store, session)) {
        store.unlockAchievement(a.id);
        newly.push(a);
      }
    }
    return newly;
  }

  global.BTB = global.BTB || {};
  global.BTB.Achievements = ACHIEVEMENTS;
  global.BTB.evaluateAchievements = evaluateAchievements;
})(window);
