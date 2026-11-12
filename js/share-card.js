/* ============================================================
   BEAT THE BULK — Shareable workout result card
   Renders a self-contained 1080x1080 PNG summary (reps, calories,
   streak, form score) onto an offscreen canvas for download / Web
   Share — same canvas-drawing idioms as tracker.js's charts
   (roundRect, gradients), same palette as css/tokens.css.
   ============================================================ */
(function (global) {
  const COLORS = {
    bg: '#0d1016', bgAlt: '#12161f', surface: '#1a1f2b',
    primary: '#f97316', accent: '#22c55e', warning: '#fbbf24', destructive: '#ef4444',
    fg: '#f7f8fa', fgMuted: '#9aa4b8', fgFaint: '#9aa4b8', border: 'rgba(255,255,255,0.10)'
  };

  /** @param {CanvasRenderingContext2D} ctx */
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function lerpColor(a, b, t) {
    const pa = hexToRgb(a), pb = hexToRgb(b);
    const r = Math.round(pa.r + (pb.r - pa.r) * t);
    const g = Math.round(pa.g + (pb.g - pa.g) * t);
    const bch = Math.round(pa.b + (pb.b - pa.b) * t);
    return `rgb(${r},${g},${bch})`;
  }

  // A simplified static silhouette (not the live parametric BTB.Character
  // rig, which is built for DOM/SVG manipulation, not canvas), scaled by
  // the same 0-1 fitness fraction app.js already computes — heavy/grey at
  // t=0 through fit/on-brand orange+green at t=1.
  function drawSilhouette(ctx, cx, cy, scale, t) {
    const bodyColor = lerpColor('#5b6272', '#e8a97a', Math.min(1, t + 0.3));
    const outfitColor = lerpColor('#3a4152', COLORS.accent, t);
    const widthT = 1 - t * 0.26;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);

    ctx.fillStyle = outfitColor;
    roundRect(ctx, -34 * widthT, 60, 24 * widthT, 72, 10); ctx.fill();
    roundRect(ctx, 10 * widthT, 60, 24 * widthT, 72, 10); ctx.fill();
    roundRect(ctx, -46 * widthT, -30, 92 * widthT, 100, 26); ctx.fill();

    ctx.fillStyle = bodyColor;
    roundRect(ctx, -66 * widthT, -20, 20, 82, 10); ctx.fill();
    roundRect(ctx, 46 * widthT, -20, 20, 82, 10); ctx.fill();
    ctx.beginPath(); ctx.arc(0, -68, 36, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
  }

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{session: any, store: any, t: number}} data - `session` is the
   *   just-finished workout session, `store` a BTB.Store instance, `t` the
   *   0-1 fitness fraction (reuse app.js's fitnessT() rather than recompute).
   */
  function renderShareCard(canvas, data) {
    const session = data.session, store = data.store, t = data.t || 0;
    const W = 1080, H = 1080;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, COLORS.bgAlt);
    bgGrad.addColorStop(1, COLORS.bg);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    const rg = ctx.createRadialGradient(W / 2, 260, 40, W / 2, 260, 520);
    rg.addColorStop(0, 'rgba(249,115,22,0.16)');
    rg.addColorStop(1, 'rgba(249,115,22,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.fg;
    ctx.font = '700 42px "Barlow Condensed", sans-serif';
    ctx.fillText('BEAT THE BULK', W / 2, 90);
    ctx.fillStyle = COLORS.fgMuted;
    ctx.font = '600 22px Barlow, sans-serif';
    ctx.fillText('Workout Complete', W / 2, 128);

    drawSilhouette(ctx, W / 2, 330, 1.35, t);

    const cardX = 90, cardY = 560, cardW = W - 180, cardH = 340;
    ctx.fillStyle = COLORS.surface;
    roundRect(ctx, cardX, cardY, cardW, cardH, 28); ctx.fill();
    ctx.strokeStyle = COLORS.border; ctx.lineWidth = 2;
    roundRect(ctx, cardX, cardY, cardW, cardH, 28); ctx.stroke();

    const reps = (session && session.repsTotal) || 0;
    const kcal = Math.round((session && session.caloriesBurned) || 0);
    const streak = store.state.streak;
    const avgForm = session && session.formScoreCount ? Math.round(session.formScoreSum / session.formScoreCount) : null;

    const stats = [
      { label: 'REPS', value: String(reps) },
      { label: 'KCAL BURNED', value: String(kcal) },
      { label: 'DAY STREAK', value: String(streak) }
    ];
    const colW = cardW / stats.length;
    stats.forEach((s, i) => {
      const x = cardX + colW * i + colW / 2;
      ctx.fillStyle = COLORS.primary;
      ctx.font = '700 64px "Barlow Condensed", sans-serif';
      ctx.fillText(s.value, x, cardY + 130);
      ctx.fillStyle = COLORS.fgFaint;
      ctx.font = '700 18px Barlow, sans-serif';
      ctx.fillText(s.label, x, cardY + 165);
    });

    ctx.strokeStyle = COLORS.border;
    ctx.beginPath(); ctx.moveTo(cardX + 32, cardY + 210); ctx.lineTo(cardX + cardW - 32, cardY + 210); ctx.stroke();

    ctx.fillStyle = COLORS.accent;
    ctx.font = '700 30px "Barlow Condensed", sans-serif';
    ctx.fillText(`${store.state.name} is down to ${Math.round(store.state.weight)} lbs`, W / 2, cardY + 260);

    if (avgForm !== null) {
      ctx.fillStyle = avgForm >= 80 ? COLORS.accent : avgForm >= 55 ? COLORS.warning : COLORS.destructive;
      ctx.font = '700 22px Barlow, sans-serif';
      ctx.fillText(`Avg form score: ${avgForm}`, W / 2, cardY + 300);
    }

    ctx.fillStyle = COLORS.fgFaint;
    ctx.font = '600 20px Barlow, sans-serif';
    ctx.fillText('owenchlee.github.io/Beat-the-Bulk', W / 2, H - 50);
  }

  global.BTB = global.BTB || {};
  global.BTB.renderShareCard = renderShareCard;
})(window);
