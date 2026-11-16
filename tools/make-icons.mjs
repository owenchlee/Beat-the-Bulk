// Renders icons/icon-192.png, icon-512.png, apple-touch-icon.png from the shapes in icons/icon.svg.
import { PNG } from 'pngjs';
import fs from 'node:fs';

const SEGS = [[6,7,6,17],[9,9.5,9,14.5],[15,9.5,15,14.5],[18,7,18,17],[9,12,15,12]];
const SW = 2.2, R = 6, SS = 3;

function dist(px, py, [x1, y1, x2, y2]) {
  const dx = x2 - x1, dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - x1 - t * dx, py - y1 - t * dy);
}
function inRRect(x, y) {
  const cx = Math.min(Math.max(x, R), 24 - R), cy = Math.min(Math.max(y, R), 24 - R);
  return Math.hypot(x - cx, y - cy) <= R;
}
function render(size, file, opaque) {
  const png = new PNG({ width: size, height: size });
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    let o = 0, d = 0;
    for (let a = 0; a < SS; a++) for (let b = 0; b < SS; b++) {
      const x = (i + (a + .5) / SS) * 24 / size, y = (j + (b + .5) / SS) * 24 / size;
      if (opaque || inRRect(x, y)) {
        o++;
        if (SEGS.some(s => dist(x, y, s) <= SW / 2)) d++;
      }
    }
    const n = SS * SS, k = (j * size + i) * 4;
    const f = o ? d / o : 0; // dark fraction among covered samples
    png.data[k] = Math.round(0xf9 * (1 - f) + 0x0d * f);
    png.data[k + 1] = Math.round(0x73 * (1 - f) + 0x10 * f);
    png.data[k + 2] = Math.round(0x16 * (1 - f) + 0x16 * f);
    png.data[k + 3] = Math.round(255 * o / n);
  }
  fs.writeFileSync(file, PNG.sync.write(png));
}
render(192, 'icons/icon-192.png');
render(512, 'icons/icon-512.png');
render(180, 'icons/apple-touch-icon.png', true);
