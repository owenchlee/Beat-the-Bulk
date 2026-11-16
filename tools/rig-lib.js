/* Dev-only tool: shared pixel-mask segmentation library used to generate
   the RIG cutout data in js/character.js from the real character PNGs.
   Not shipped with the app. */
const { PNG } = require('pngjs');
const fs = require('fs');

function loadMask(pngPath, alphaThreshold) {
  alphaThreshold = alphaThreshold === undefined ? 24 : alphaThreshold;
  const png = PNG.sync.read(fs.readFileSync(pngPath));
  const { width, height, data } = png;
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) mask[i] = data[(i << 2) + 3] > alphaThreshold ? 1 : 0;
  return { width, height, mask };
}

// Zero out mask pixels inside a percentage-coordinate polygon (used to
// remove already-cutout arm regions before segmenting legs).
function subtractPolygonPct(mask, width, height, polygonPct) {
  const poly = polygonPct.map(([px, py]) => [px / 100 * width, py / 100 * height]);
  let minY = height, maxY = 0;
  for (const [, y] of poly) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  minY = Math.max(0, Math.floor(minY)); maxY = Math.min(height - 1, Math.ceil(maxY));
  for (let y = minY; y <= maxY; y++) {
    for (let x = 0; x < width; x++) {
      if (pointInPolygon(x + 0.5, y + 0.5, poly)) mask[y * width + x] = 0;
    }
  }
}

function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// Zero out mask pixels within `thickness` px of the segment p1->p2 (a
// synthetic "cut" at a joint line, severing connectivity there).
function drawCutLine(mask, width, height, p1, p2, thickness) {
  const steps = Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) * 2);
  const half = thickness / 2;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const cx = p1[0] + (p2[0] - p1[0]) * t;
    const cy = p1[1] + (p2[1] - p1[1]) * t;
    for (let dy = -half; dy <= half; dy++) {
      for (let dx = -half; dx <= half; dx++) {
        const x = Math.round(cx + dx), y = Math.round(cy + dy);
        if (x >= 0 && x < width && y >= 0 && y < height) mask[y * width + x] = 0;
      }
    }
  }
}

// 4-connected flood fill from (seedX,seedY) over `mask`, returns a new
// component mask (does not mutate `mask`).
function floodFill(mask, width, height, seedX, seedY) {
  const out = new Uint8Array(width * height);
  const seedIdx = seedY * width + seedX;
  if (!mask[seedIdx]) return out;
  const stack = [seedIdx];
  out[seedIdx] = 1;
  while (stack.length) {
    const idx = stack.pop();
    const x = idx % width, y = (idx / width) | 0;
    const neighbors = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
    for (const [nx, ny] of neighbors) {
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const nIdx = ny * width + nx;
      if (mask[nIdx] && !out[nIdx]) { out[nIdx] = 1; stack.push(nIdx); }
    }
  }
  return out;
}

function componentPixelCount(comp) { let n = 0; for (let i = 0; i < comp.length; i++) n += comp[i]; return n; }

// Moore-neighbor boundary trace of a single connected component mask.
// Returns an ordered list of [x,y] pixel-corner points forming the outline.
// Standard algorithm: at each boundary pixel, scan its 8-neighborhood
// clockwise starting just past the "backtrack" pixel (the last background
// pixel we came from) to find the next boundary pixel.
function traceContour(comp, width, height) {
  const at = (x, y) => (x < 0 || x >= width || y < 0 || y >= height) ? 0 : comp[y * width + x];
  let start = null;
  outer:
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (at(x, y)) { start = [x, y]; break outer; }
    }
  }
  if (!start) return [];

  const dirs = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]]; // N,NE,E,SE,S,SW,W,NW

  // Isolated single pixel: no boundary walk needed.
  const hasAnyNeighbor = dirs.some(([dx, dy]) => at(start[0] + dx, start[1] + dy));
  if (!hasAnyNeighbor) return [start];

  let current = start;
  let backtrack = [start[0] - 1, start[1]]; // guaranteed background (raster-scan order)
  const boundary = [start];
  const maxSteps = width * height * 8;

  for (let guard = 0; guard < maxSteps; guard++) {
    const bdx = backtrack[0] - current[0], bdy = backtrack[1] - current[1];
    const bIdx = dirs.findIndex(([dx, dy]) => dx === bdx && dy === bdy);
    let found = null, prevChecked = backtrack;
    for (let k = 1; k <= 8; k++) {
      const idx = (bIdx + k) % 8;
      const [dx, dy] = dirs[idx];
      const nx = current[0] + dx, ny = current[1] + dy;
      if (at(nx, ny)) { found = [nx, ny]; break; }
      prevChecked = [nx, ny];
    }
    if (!found) break;
    backtrack = prevChecked;
    current = found;
    if (current[0] === start[0] && current[1] === start[1]) break;
    boundary.push(current);
  }
  return boundary;
}

function perpendicularDistance(pt, a, b) {
  const [x, y] = pt, [x1, y1] = a, [x2, y2] = b;
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return Math.hypot(x - x1, y - y1);
  return Math.abs(dy * x - dx * y + x2 * y1 - y2 * x1) / len;
}

// Douglas-Peucker polyline simplification.
function simplify(points, epsilon) {
  if (points.length < 3) return points.slice();
  let maxDist = 0, maxIdx = 0;
  const a = points[0], b = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], a, b);
    if (d > maxDist) { maxDist = d; maxIdx = i; }
  }
  if (maxDist > epsilon) {
    const left = simplify(points.slice(0, maxIdx + 1), epsilon);
    const right = simplify(points.slice(maxIdx), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [a, b];
}

function toPct(points, width, height, decimals) {
  decimals = decimals === undefined ? 2 : decimals;
  const f = Math.pow(10, decimals);
  return points.map(([x, y]) => [Math.round((x / width) * 100 * f) / f, Math.round((y / height) * 100 * f) / f]);
}

// High-level: isolate the component touching `seed`, after applying `cuts`
// (list of {p1,p2,thickness}) and `subtractPolys` (existing polygons to
// remove first), then trace+simplify+convert to a % polygon.
function segment(opts) {
  const { width, height, mask: baseMask } = loadMask(opts.src, opts.alphaThreshold);
  const mask = baseMask.slice();
  for (const poly of (opts.subtractPolysPct || [])) subtractPolygonPct(mask, width, height, poly);
  for (const cut of (opts.cuts || [])) drawCutLine(mask, width, height, cut.p1, cut.p2, cut.thickness || 3);
  const comp = floodFill(mask, width, height, opts.seed[0], opts.seed[1]);
  const count = componentPixelCount(comp);
  if (count < (opts.minPixels || 20)) return null;
  const contour = traceContour(comp, width, height);
  const simplified = simplify(contour, opts.epsilon || 1.2);
  const polygonPct = toPct(simplified, width, height);
  return { polygonPct, pixelCount: count, width, height };
}

module.exports = { loadMask, subtractPolygonPct, drawCutLine, floodFill, componentPixelCount, traceContour, simplify, toPct, segment, pointInPolygon };
