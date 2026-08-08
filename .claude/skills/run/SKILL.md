---
name: run
description: Launch Beat the Bulk (Blobby Fit / Workout Buddy) locally over HTTP and open it in the browser.
---

# Running Beat the Bulk

The live app is `index.html` at the repo root, built from a modular
`css/` + `js/` architecture (no bundler — plain `<script>`/`<link>` tags,
loaded directly by the browser). Two legacy self-contained single-file
prototypes are kept for reference under `legacy/`:

- `legacy/blobby_fit.html` — earlier "Blobby Fit" full prototype
- `legacy/workout_buddy.html` — earlier, simpler "Workout Buddy" prototype

All three load MediaPipe (`camera_utils`, `drawing_utils`, `pose`) from a CDN
and use the webcam for pose tracking. **Do not open these files directly as
`file://` URLs** — camera access is unreliable outside a proper HTTP context.
Always serve them over `http://localhost`.

Note: the repo also has a Node-only `package.json` (tests + `tsc --checkJs`)
for development — that's dev/CI tooling only and has no effect on running the
app itself, which still requires zero installs.

## Start the server

Use the zero-dependency static server included with this skill (Node.js is
required, no npm install needed):

```
node .claude/skills/run/serve.js
```

Run this in the background (e.g. `run_in_background: true` in Bash, or `Start-Process`
in PowerShell) since it blocks. It serves the repo root and prints URLs for
the current app and the two legacy prototypes. Default port is 8000; if
that's taken it tries 8001, 8002, ... up to 8009 — read the server's stdout
to see which port it actually bound.

## Open the app

Defaults to `index.html`, the current app. Open in the default browser:

- Windows (PowerShell): `Start-Process "http://localhost:8000/index.html"`
- Or use the claude-in-chrome tools to navigate a tab there directly, which
  also lets you screenshot/verify the result and grant camera permission
  prompts if needed.

Only open a `legacy/*.html` file if the user specifically asks for the old
prototype.

## Stopping

Kill the background `node serve.js` process when done (TaskStop / Ctrl+C).
