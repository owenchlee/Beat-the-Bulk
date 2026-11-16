/* Dev-only tool: merge generated legL/legR polygons into js/character.js's
   RIG table. Not shipped with the app. Run once, then delete/ignore. */
const fs = require('fs');
const path = require('path');

const CHAR_JS = path.join(__dirname, '..', 'js', 'character.js');
const src = fs.readFileSync(CHAR_JS, 'utf8');
const m = src.match(/const RIG = (\{.*\});/);
if (!m) throw new Error('RIG table not found');
const RIG = JSON.parse(m[1]);

// Re-derive leg data directly (same logic as gen-legs.js) so this merge is
// self-contained and reproducible without depending on prior JSON output.
const { segment } = require('./rig-lib');
const { PNG } = require('pngjs');
const CHAR_DIR = path.join(__dirname, '..', 'img', 'characters');

const HIP_Y = {
  'male-1': 304, 'male-2': 306, 'male-3': 300, 'male-4': 282, 'male-5': 282, 'male-6': 292,
  'female-1': 264, 'female-2': 261, 'female-3': 256, 'female-4': 256, 'female-5': 256, 'female-6': 256
};

function rowSpans(mask, width, y) {
  const spans = []; let start = null;
  for (let x = 0; x < width; x++) {
    const on = mask[y * width + x];
    if (on && start === null) start = x;
    if (!on && start !== null) { spans.push([start, x - 1]); start = null; }
  }
  if (start !== null) spans.push([start, width - 1]);
  return spans.filter(([a, b]) => b - a >= 5);
}

function pivotFromPolygon(polygonPct, hipYPct) {
  const near = polygonPct.filter(([, y]) => Math.abs(y - hipYPct) < 1.5);
  const xs = (near.length ? near : polygonPct).map(([x]) => x);
  return [Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100, Math.round(hipYPct * 100) / 100];
}

const { loadMask } = require('./rig-lib');

for (const key of Object.keys(HIP_Y)) {
  const hipY = HIP_Y[key];
  const src2 = path.join(CHAR_DIR, key + '.png');
  const { width, height, mask } = loadMask(src2);
  const spans = rowSpans(mask, width, hipY + 40);
  if (spans.length !== 2) throw new Error(`${key}: expected 2 leg spans, got ${JSON.stringify(spans)}`);
  const [left, right] = spans;
  const crotchX = Math.round((left[1] + right[0]) / 2);
  const seedL = [Math.round((left[0] + left[1]) / 2), hipY + 40];
  const seedR = [Math.round((right[0] + right[1]) / 2), hipY + 40];
  const cuts = [
    { p1: [0, hipY], p2: [width, hipY], thickness: 3 },
    { p1: [crotchX, hipY], p2: [crotchX, height], thickness: 3 }
  ];
  const rig = RIG[key];
  const subtractPolysPct = [];
  if (rig.L) subtractPolysPct.push(rig.L.polygonPct);
  if (rig.R) subtractPolysPct.push(rig.R.polygonPct);

  const legL = segment({ src: src2, cuts, seed: seedL, subtractPolysPct, epsilon: 1.2, minPixels: 50 });
  const legR = segment({ src: src2, cuts, seed: seedR, subtractPolysPct, epsilon: 1.2, minPixels: 50 });
  if (!legL || !legR) throw new Error(`${key}: leg segmentation failed`);
  const hipYPct = (hipY / height) * 100;

  rig.legL = { polygonPct: legL.polygonPct, pivotPct: pivotFromPolygon(legL.polygonPct, hipYPct) };
  rig.legR = { polygonPct: legR.polygonPct, pivotPct: pivotFromPolygon(legR.polygonPct, hipYPct) };
}

const newSrc = src.replace(/const RIG = \{.*\};/, `const RIG = ${JSON.stringify(RIG)};`);
fs.writeFileSync(CHAR_JS, newSrc);
console.log('merged legL/legR into', CHAR_JS);
