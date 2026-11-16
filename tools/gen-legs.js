/* Dev-only tool: batch-generate legL/legR RIG cutout polygons for all 12
   character images using hand-picked hip/crotch coordinates, and render a
   preview PNG per character for visual QA before merging into character.js.
   Not shipped with the app. */
const { PNG } = require('pngjs');
const fs = require('fs');
const path = require('path');
const { segment, pointInPolygon, loadMask } = require('./rig-lib');

const CHAR_DIR = path.join(__dirname, '..', 'img', 'characters');
const OUT_DIR = process.argv[2]; // preview output dir

// Hand-picked per-image hip cut Y (pixel coords), determined by visual
// inspection of gridded crops (see tools/grid-overlay.js) — the height
// where the leg silhouette naturally separates into two spans. crotchX and
// leg seed points are derived automatically below from the real pixel
// spans at that row, rather than eyeballed, since a fixed width-fraction
// guess was wrong for the wider body-fat stages (legs sit closer together
// relative to canvas width there).
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
  return spans.filter(([a, b]) => b - a >= 5); // drop 1-2px noise specks
}

function deriveCuts(key) {
  const hipY = HIP_Y[key];
  const src = path.join(CHAR_DIR, key + '.png');
  const { width, height, mask } = loadMask(src);
  const spans = rowSpans(mask, width, hipY + 40);
  if (spans.length !== 2) throw new Error(`${key}: expected 2 leg spans at y=${hipY + 40}, got ${JSON.stringify(spans)}`);
  const [left, right] = spans;
  const crotchX = Math.round((left[1] + right[0]) / 2);
  const seedL = [Math.round((left[0] + left[1]) / 2), hipY + 40];
  const seedR = [Math.round((right[0] + right[1]) / 2), hipY + 40];
  return { hipY, crotchX, seedL, seedR, width, height };
}

const CUTS = {};
for (const key of Object.keys(HIP_Y)) CUTS[key] = deriveCuts(key);

const charSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'character.js'), 'utf8');
const m = charSrc.match(/const RIG = (\{.*\});/);
const RIG = JSON.parse(m[1].replace(/(\w+):/g, '"$1":'));

function pivotFromPolygon(polygonPct, hipYPct) {
  const near = polygonPct.filter(([, y]) => Math.abs(y - hipYPct) < 1.5);
  const xs = (near.length ? near : polygonPct).map(([x]) => x);
  return [Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100, Math.round(hipYPct * 100) / 100];
}

function segLeg(key, side) {
  const cfg = CUTS[key];
  const src = path.join(CHAR_DIR, key + '.png');
  const rig = RIG[key];
  const { width, height } = PNG.sync.read(fs.readFileSync(src));
  const subtractPolysPct = [];
  if (rig.L) subtractPolysPct.push(rig.L.polygonPct);
  if (rig.R) subtractPolysPct.push(rig.R.polygonPct);

  const cuts = [
    { p1: [0, cfg.hipY], p2: [width, cfg.hipY], thickness: 3 },
    { p1: [cfg.crotchX, cfg.hipY], p2: [cfg.crotchX, height], thickness: 3 }
  ];
  const seed = side === 'L' ? cfg.seedL : cfg.seedR;

  const result = segment({ src, cuts, seed, subtractPolysPct, epsilon: 1.2, minPixels: 50 });
  if (!result) return null;
  const hipYPct = (cfg.hipY / height) * 100;
  const pivotPct = pivotFromPolygon(result.polygonPct, hipYPct);
  return { polygonPct: result.polygonPct, pivotPct, pixelCount: result.pixelCount, width, height };
}

function renderPreview(key, legL, legR) {
  const src = path.join(CHAR_DIR, key + '.png');
  const png = PNG.sync.read(fs.readFileSync(src));
  const { width: w, height: h, data } = png;
  const BG = [230, 230, 230];
  for (let i = 0; i < w * h; i++) {
    const o = i << 2;
    const a = data[o + 3] / 255;
    data[o] = Math.round(data[o] * a + BG[0] * (1 - a));
    data[o + 1] = Math.round(data[o + 1] * a + BG[1] * (1 - a));
    data[o + 2] = Math.round(data[o + 2] * a + BG[2] * (1 - a));
    data[o + 3] = 255;
  }
  function paint(leg, color) {
    if (!leg) return;
    const poly = leg.polygonPct.map(([px, py]) => [px / 100 * w, py / 100 * h]);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (pointInPolygon(x + 0.5, y + 0.5, poly)) {
        const o = (y * w + x) << 2;
        data[o] = Math.round(data[o] * 0.35 + color[0] * 0.65);
        data[o + 1] = Math.round(data[o + 1] * 0.35 + color[1] * 0.65);
        data[o + 2] = Math.round(data[o + 2] * 0.35 + color[2] * 0.65);
      }
    }
    const [pvx, pvy] = [leg.pivotPct[0] / 100 * w, leg.pivotPct[1] / 100 * h];
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const x = Math.round(pvx + dx), y = Math.round(pvy + dy);
      if (x >= 0 && x < w && y >= 0 && y < h) {
        const o = (y * w + x) << 2;
        data[o] = 0; data[o + 1] = 255; data[o + 2] = 0;
      }
    }
  }
  paint(legL, [255, 0, 200]);
  paint(legR, [0, 140, 255]);
  fs.writeFileSync(path.join(OUT_DIR, key + '-legs-preview.png'), PNG.sync.write(png));
}

const results = {};
for (const key of Object.keys(CUTS)) {
  const legL = segLeg(key, 'L');
  const legR = segLeg(key, 'R');
  results[key] = { legL, legR };
  renderPreview(key, legL, legR);
  console.log(key, 'legL', legL ? legL.pixelCount + 'px' : 'FAILED', 'legR', legR ? legR.pixelCount + 'px' : 'FAILED');
}
fs.writeFileSync(path.join(OUT_DIR, 'legs-data.json'), JSON.stringify(results, null, 0));
console.log('wrote', path.join(OUT_DIR, 'legs-data.json'));
