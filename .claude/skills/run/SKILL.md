---
name: run
description: Launch Beat the Bulk (Blobby Fit / Workout Buddy) locally over HTTP and open it in the browser.
---

# Running Beat the Bulk

This repo has no build step and no dependencies — it's two standalone,
self-contained HTML files at the repo root:

- `blobby_fit.html` — "Blobby Fit" app
- `workout_buddy.html` — "Workout Buddy" app

Both load MediaPipe (`camera_utils`, `drawing_utils`, `pose`) from a CDN and use
the webcam for pose tracking. **Do not open these files directly as
`file://` URLs** — camera access is unreliable outside a proper HTTP context.
Always serve them over `http://localhost`.

## Start the server

Use the zero-dependency static server included with this skill (Node.js is
required, no npm install needed):

```
node .claude/skills/run/serve.js
```

Run this in the background (e.g. `run_in_background: true` in Bash, or `Start-Process`
in PowerShell) since it blocks. It serves the repo root and prints the URLs
for both apps. Default port is 8000; if that's taken it tries 8001, 8002, ...
up to 8009 — read the server's stdout to see which port it actually bound.

## Open the app

If the user didn't specify which app, ask (or default to `workout_buddy.html`,
the more feature-complete one). Open in the default browser:

- Windows (PowerShell): `Start-Process "http://localhost:8000/workout_buddy.html"`
- Or use the claude-in-chrome tools to navigate a tab there directly, which
  also lets you screenshot/verify the result and grant camera permission
  prompts if needed.

## Stopping

Kill the background `node serve.js` process when done (TaskStop / Ctrl+C).
