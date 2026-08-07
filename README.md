# Beat the Bulk 🏋️

A browser game that turns your webcam into a rep counter. Do the exercise, the camera sees it, your on-screen buddy gets fitter — no sign-up, no app, no equipment.

**[Play it live →](https://owenchlee.github.io/Beat-the-Bulk/)**

## What it does

You're coaching Blobby, a character that starts out overweight and out of shape. Each day you're given a short circuit of bodyweight exercises — jumping jacks, squats, overhead presses, that sort of thing. Your webcam feed runs through pose detection in the browser, and every completed rep is counted automatically and shaves weight off Blobby, who visibly slims down as you go.

Finish the workout and you're not done yet: an end-of-day "dinner" mini-game lets you feed Blobby from a mix of healthy and indulgent food. Healthier choices mean less of the weight comes back overnight, so tomorrow's workout starts from a better place. A progress tab charts your weight trend, milestones hit, and day streak over time.

No camera? The app falls back to a demo mode that auto-advances reps so you can still see how everything works.

## How it works

Pose tracking runs entirely client-side using [MediaPipe Pose](https://developers.google.com/mediapipe) — your webcam video never leaves the browser or gets uploaded anywhere. Each exercise has a small detector function that watches specific body landmarks (wrists relative to shoulders for a jumping jack, hip-to-knee angle for a squat, and so on) and fires once per completed rep. Progress, weight, and day streak are saved to `localStorage`, so your run persists between visits on the same browser.

Everything — markup, styles, detection logic, and character animation — lives in a single self-contained HTML file. No build step, no backend, no dependencies beyond the MediaPipe scripts loaded from a CDN.

## Files

| File | What it is |
|---|---|
| `index.html` | The live app served by GitHub Pages — same as `blobby_fit.html`. |
| `blobby_fit.html` | The full version: weight-goal tracking, milestones, a progress chart, and the dinner mini-game. |
| `workout_buddy.html` | An earlier, simpler prototype with a smaller exercise set and no progress chart. Kept around for reference. |

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

## Notes

- Weight numbers, calorie values, and rep-to-pound conversions are all simplified for gameplay — this is not a fitness or nutrition tool.
- Pose detection accuracy depends on lighting and how much of your body is in frame; the on-screen tip ("stand ~2m back, full body in view") helps a lot.
