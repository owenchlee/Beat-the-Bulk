// Minimal shim so js/*.js's `(function (global) { ... })(window)` wrapper
// and bare `localStorage` references can load under plain Node, with no
// browser/DOM. Only covers what workouts.js/tracker.js/pose-tracker.js's
// pure logic actually touches when loaded and exercised outside a real page.
'use strict';

function makeLocalStorage() {
  const data = new Map();
  return {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); },
    removeItem(key) { data.delete(key); },
    clear() { data.clear(); }
  };
}

global.window = global;
global.localStorage = makeLocalStorage();
global.devicePixelRatio = 1;

module.exports = { makeLocalStorage };
