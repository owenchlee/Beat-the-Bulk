/* Dev-only tool: run rig-lib.segment() with given cut coordinates and paint
   the resulting polygon back onto the source image so the cutout can be
   sanity-checked visually before it's trusted. Not shipped with the app.
   Usage: node preview-segment.js <src> <outPath> <configJson>
   configJson: { cuts:[{p1:[x,y],p2:[x,y],thickness}], seed:[x,y], subtractRigKey, subtractSide } */
const { PNG } = require('pngjs');
const fs = require('fs');
const path = require('path');
const { segment, pointInPolygon } = require('./rig-lib');

const [, , srcPath, outPath, configPath] = process.argv;
const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));

let subtractPolysPct = [];
if (cfg.subtractRigKey) {
  const charSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'character.js'), 'utf8');
  const m = charSrc.match(/const RIG = (\{.*\});/);
  const RIG = JSON.parse(m[1].replace(/(\w+):/g, '"$1":'));
  const rig = RIG[cfg.subtractRigKey];
  for (const side of (cfg.subtractSides || ['L', 'R'])) {
    if (rig[side]) subtractPolysPct.push(rig[side].polygonPct);
  }
}

const result = segment({
  src: srcPath,
  cuts: cfg.cuts,
  seed: cfg.seed,
  subtractPolysPct,
  epsilon: cfg.epsilon || 1.2,
  minPixels: cfg.minPixels || 20
});

if (!result) {
  console.log('NO COMPONENT FOUND (seed not in mask, or too small)');
  process.exit(1);
}
console.log(`segmented ${result.pixelCount}px, polygon ${result.polygonPct.length} verts`);
console.log(JSON.stringify(result.polygonPct));

// Paint the result onto a flattened copy for visual verification.
const png = PNG.sync.read(fs.readFileSync(srcPath));
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
const poly = result.polygonPct.map(([px, py]) => [px / 100 * w, py / 100 * h]);
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    if (pointInPolygon(x + 0.5, y + 0.5, poly)) {
      const o = (y * w + x) << 2;
      data[o] = Math.round(data[o] * 0.35 + 255 * 0.65);
      data[o + 1] = Math.round(data[o + 1] * 0.35 + 0 * 0.65);
      data[o + 2] = Math.round(data[o + 2] * 0.35 + 200 * 0.65);
    }
  }
}
// draw pivot marker
if (cfg.pivot) {
  const [pvx, pvy] = cfg.pivot;
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
    const x = pvx + dx, y = pvy + dy;
    if (x >= 0 && x < w && y >= 0 && y < h) {
      const o = (y * w + x) << 2;
      data[o] = 0; data[o + 1] = 255; data[o + 2] = 0;
    }
  }
}
fs.writeFileSync(outPath, PNG.sync.write(png));
console.log('wrote preview to', outPath);
