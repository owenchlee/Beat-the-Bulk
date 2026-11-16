/* Dev-only tool: crop + upscale + overlay a pixel-coordinate grid onto a
   character PNG region so joint cut-lines can be picked by eye precisely.
   Not shipped with the app. Flattens onto a light background first (source
   PNGs are transparent).
   Usage: node grid-overlay.js <src> <out> [yStartPct] [yEndPct] [scale] [minorPx] [majorPx] */
const { PNG } = require('pngjs');
const fs = require('fs');

function run(srcPath, outPath, yStartPct, yEndPct, scale, minor, major) {
  const src = PNG.sync.read(fs.readFileSync(srcPath));
  const w = src.width, h = src.height;
  const y0 = Math.floor((yStartPct / 100) * h);
  const y1 = Math.ceil((yEndPct / 100) * h);
  const cropH = y1 - y0;
  const outW = w * scale, outH = cropH * scale;
  const out = new PNG({ width: outW, height: outH });
  const BG = [230, 230, 230];

  for (let oy = 0; oy < outH; oy++) {
    const sy = y0 + Math.floor(oy / scale);
    for (let ox = 0; ox < outW; ox++) {
      const sx = Math.floor(ox / scale);
      const si = (w * sy + sx) << 2;
      const a = src.data[si + 3] / 255;
      const oi = (outW * oy + ox) << 2;
      out.data[oi] = Math.round(src.data[si] * a + BG[0] * (1 - a));
      out.data[oi + 1] = Math.round(src.data[si + 1] * a + BG[1] * (1 - a));
      out.data[oi + 2] = Math.round(src.data[si + 2] * a + BG[2] * (1 - a));
      out.data[oi + 3] = 255;
    }
  }

  function setPx(x, y, r, g, b) {
    if (x < 0 || x >= outW || y < 0 || y >= outH) return;
    const i = (outW * y + x) << 2;
    out.data[i] = r; out.data[i + 1] = g; out.data[i + 2] = b; out.data[i + 3] = 255;
  }

  // gridlines in original-image pixel units, translated into crop+scale space
  for (let sy = y0; sy <= y1; sy += minor) {
    const oy = (sy - y0) * scale;
    const isMajor = sy % major === 0;
    for (let ox = 0; ox < outW; ox++) setPx(ox, oy, isMajor ? 255 : 0, isMajor ? 0 : 220, isMajor ? 220 : 255);
  }
  for (let sx = 0; sx <= w; sx += minor) {
    const ox = sx * scale;
    const isMajor = sx % major === 0;
    for (let oy = 0; oy < outH; oy++) setPx(ox, oy, isMajor ? 255 : 0, isMajor ? 0 : 220, isMajor ? 220 : 255);
  }

  fs.writeFileSync(outPath, PNG.sync.write(out));
  console.log(`wrote ${outPath} — src ${w}x${h}, crop y[${y0},${y1}], out ${outW}x${outH}`);
}

const [, , srcPath, outPath, yStart, yEnd, scale, minor, major] = process.argv;
run(srcPath, outPath, parseFloat(yStart || '0'), parseFloat(yEnd || '100'), parseInt(scale || '3', 10), parseInt(minor || '10', 10), parseInt(major || '50', 10));
