# Beat the Bulk 🏋️

[![CI](https://github.com/owenchlee/Beat-the-Bulk/actions/workflows/ci.yml/badge.svg)](https://github.com/owenchlee/Beat-the-Bulk/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Live Demo](https://img.shields.io/badge/demo-live-orange)](https://owenchlee.github.io/Beat-the-Bulk/)

A browser game that turns your webcam into a rep counter. Do the exercise, the camera sees it, your on-screen buddy gets fitter — no sign-up, no app, no equipment.

**[Play it live →](https://owenchlee.github.io/Beat-the-Bulk/)**

## What it does

You're coaching a character that starts out overweight and out of shape. Each day you're given a short circuit of bodyweight exercises — jumping jacks, squats, push-ups, lunges, and more. Your webcam feed runs through pose detection in the browser, and every completed rep is counted automatically and shaves weight off your character, who visibly slims down as you go.

Finish the workout and you're not done yet: an end-of-day "dinner" mini-game lets you feed your character from a mix of healthy and indulgent food. Healthier choices mean less of the weight comes back overnight, so tomorrow's workout starts from a better place. A progress tab charts your weight trend, milestones hit, and day streak over time.

No camera? The app falls back to a demo mode that auto-advances reps so you can still see how everything works.

## How it works

Pose tracking runs entirely client-side using [MediaPipe Pose](https://developers.google.com/mediapipe) — your webcam video never leaves the browser or gets uploaded anywhere. Each exercise has a small detector function that watches specific body landmarks (wrists relative to shoulders for a jumping jack, hip-to-knee angle for a squat, and so on) and fires once per completed rep. Progress, weight, and day streak are saved to `localStorage`, so your run persists between visits on the same browser.

## Architecture

The app is a **zero-build, zero-dependency static site** — no bundler, no npm install required to run it. Everything loads via plain `<link>`/`<script>` tags in `index.html`, in dependency order:

```
css/tokens.css → base.css → components.css → animations.css
js/icons.js → character.js → audio.js → pose-tracker.js → workouts.js → foods.js → tracker.js → app.js
```

All JS modules attach to a shared global namespace, `window.BTB`, rather than using ES module imports — this keeps the app runnable by opening/serving `index.html` directly, with no build step.

| File | Responsibility |
|---|---|
| `css/tokens.css` | Design tokens — colors, spacing, typography, motion, elevation |
| `css/base.css`, `components.css`, `animations.css` | Reset, component styles, keyframe animations |
| `js/icons.js` | Inline SVG icon set (`BTB.icon`) |
| `js/character.js` | Parametric, angle-driven SVG avatar rig (`BTB.Character`) |
| `js/audio.js` | Fully synthesized Web Audio music/SFX engine (`BTB.Audio`) — no audio files |
| `js/pose-tracker.js` | MediaPipe Pose wrapper + per-exercise rep-detection state machines |
| `js/workouts.js` | Exercise catalog, workout-plan builder, MET-based calorie math |
| `js/foods.js` | Dinner mini-game food/calorie data |
| `js/tracker.js` | `localStorage` persistence (`BTB.Store`) + hand-rolled canvas progress charts |
| `js/app.js` | App orchestrator — state machine, tab navigation, DOM wiring |

Development tooling (tests, `tsc --checkJs` type-checking) lives in `package.json`/`devDependencies` and runs only in Node/CI — it has no effect on how the app ships or runs in the browser.

## Files

| Path | What it is |
|---|---|
| `index.html` | The live app served by GitHub Pages, built from `css/` + `js/`. |
| `css/`, `js/` | The modular source for the current app. |
| `legacy/blobby_fit.html` | Earlier full single-file prototype: weight-goal tracking, milestones, a progress chart, and the dinner mini-game — superseded by the modular rewrite, kept for reference. |
| `legacy/workout_buddy.html` | An even earlier, simpler single-file prototype with a smaller exercise set and no progress chart. Kept for reference. |

## Running it locally

It's a static file, so any local server works:

```bash
git clone https://github.com/owenchlee/Beat-the-Bulk.git
cd Beat-the-Bulk
python -m http.server 8000
# open http://localhost:8000
```

Opening the HTML file directly (`file://`) may block webcam access in some browsers — serving it over `http://localhost` avoids that.

You'll need a webcam and a browser that supports `getUserMedia` (any recent Chrome, Firefox, Safari, or Edge).

### Running the dev checks

Optional, Node-only, has no effect on the shipped app:

```bash
npm install
npm test        # runs the test suite (node:test)
npm run typecheck  # runs tsc --checkJs against js/**/*.js
```

## Notes

- Weight numbers, calorie values, and rep-to-pound conversions are all simplified for gameplay — this is not a fitness or nutrition tool.
- Pose detection accuracy depends on lighting and how much of your body is in frame; the on-screen tip ("stand ~2m back, full body in view") helps a lot.
