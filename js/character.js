/* ============================================================
   BEAT THE BULK — Character rig
   A parametric, angle-driven SVG avatar (not a static blob).
   Limbs are tapered capsules computed from shoulder/elbow/hip/knee
   angles, so the same rig can strike different poses (idle, active,
   celebrate, sad) and continuously morph body proportions between
   "heavy" (t=0) and "fit" (t=1).
   ============================================================ */
(function (global) {
  const NS = 'http://www.w3.org/2000/svg';
  const TAU = Math.PI / 180;

  /** @param {number} a @param {number} b @param {number} t */
  function lerp(a, b, t) { return a + (b - a) * t; }
  /** @param {number} t */
  function clamp01(t) { return Math.max(0, Math.min(1, t)); }

  /** @param {string} hex */
  function hexToRgb(hex) {
    const n = parseInt(hex.replace('#', ''), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  /** @param {string} hexA @param {string} hexB @param {number} t */
  function lerpColor(hexA, hexB, t) {
    const a = hexToRgb(hexA), b = hexToRgb(hexB);
    const r = Math.round(lerp(a.r, b.r, t));
    const g = Math.round(lerp(a.g, b.g, t));
    const bl = Math.round(lerp(a.b, b.b, t));
    return `rgb(${r},${g},${bl})`;
  }

  /** @param {number} cx @param {number} cy @param {number} angDeg @param {number} len */
  function polar(cx, cy, angDeg, len) {
    const a = angDeg * TAU;
    return { x: cx + len * Math.cos(a), y: cy + len * Math.sin(a) };
  }

  // Tapered capsule (stadium) between two circles of radius r1/r2, built as
  // a straight-sided quad plus two end-cap circles. Two independent convex
  // primitives are far more robust than a single hand-rolled arc path (which
  // can self-intersect and carve a hole when radii differ) and render
  // identically once filled with the same color.
  /** @param {string} fill @param {number} x1 @param {number} y1 @param {number} r1 @param {number} x2 @param {number} y2 @param {number} r2 */
  function limb(fill, x1, y1, r1, x2, y2, r2) {
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const p1a = { x: x1 + nx * r1, y: y1 + ny * r1 };
    const p1b = { x: x1 - nx * r1, y: y1 - ny * r1 };
    const p2a = { x: x2 + nx * r2, y: y2 + ny * r2 };
    const p2b = { x: x2 - nx * r2, y: y2 - ny * r2 };
    const frag = document.createDocumentFragment();
    frag.appendChild(el('circle', { cx: x1, cy: y1, r: r1, fill }));
    frag.appendChild(el('circle', { cx: x2, cy: y2, r: r2, fill }));
    frag.appendChild(el('polygon', {
      points: `${p1a.x.toFixed(1)},${p1a.y.toFixed(1)} ${p2a.x.toFixed(1)},${p2a.y.toFixed(1)} ${p2b.x.toFixed(1)},${p2b.y.toFixed(1)} ${p1b.x.toFixed(1)},${p1b.y.toFixed(1)}`,
      fill
    }));
    return frag;
  }

  /** @param {string} tag @param {Record<string, any>} attrs */
  function el(tag, attrs) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  // ---- Pose library: angles in degrees (0=right, 90=down, -90=up) ----
  const POSES = {
    idle: { shL: 116, elL: 12, shR: 64, elR: -12, hipL: 96, kneeL: 4, hipR: 84, kneeR: -4, lean: 0, bob: 0 },
    active: { shL: -60, elL: -20, shR: -120, elR: 20, hipL: 100, kneeL: 8, hipR: 80, kneeR: -8, lean: -2, bob: -4 },
    squat: { shL: 60, elL: 60, shR: 120, elR: -60, hipL: 108, kneeL: 26, hipR: 72, kneeR: -26, lean: 3, bob: 10 },
    celebrate: { shL: -150, elL: -70, shR: -30, elR: 70, hipL: 98, kneeL: 6, hipR: 82, kneeR: -6, lean: -3, bob: -8 },
    sad: { shL: 122, elL: 8, shR: 58, elR: -8, hipL: 94, kneeL: 2, hipR: 86, kneeR: -2, lean: 8, bob: 6 },
    eat: { shL: 55, elL: 70, shR: 95, elR: -8, hipL: 96, kneeL: 4, hipR: 84, kneeR: -4, lean: 2, bob: 2 }
  };

  const OUTFIT_HEAVY = '#6b7280';
  const OUTFIT_FIT = '#1f9d55';
  const SHORTS_HEAVY = '#4b5563';
  const SHORTS_FIT = '#161b26';
  const SHOE_STRIPE_HEAVY = '#9ca3af';
  const SHOE_STRIPE_FIT = '#f97316';

  function Character(mount, opts) {
    this.mount = mount;
    this.t = 0; // 0 = heavy, 1 = fit
    this.pose = 'idle';
    this.mood = 'normal'; // normal | happy | sad | working
    this.blinkT = 0;
    this._build();
    this.update({ t: 0, pose: 'idle', mood: 'sad' });
  }

  Character.prototype._build = function () {
    const svg = el('svg', { viewBox: '0 0 200 244', xmlns: NS, id: this.mount.id + 'Svg' });

    const defs = el('defs', {});
    // Skin gradient
    const skin = el('radialGradient', { id: 'gradSkin', cx: '35%', cy: '28%', r: '75%' });
    skin.appendChild(el('stop', { offset: '0%', 'stop-color': '#ffdcb0' }));
    skin.appendChild(el('stop', { offset: '100%', 'stop-color': '#e8a874' }));
    defs.appendChild(skin);
    // Hair gradient
    const hair = el('linearGradient', { id: 'gradHair', x1: '0%', y1: '0%', x2: '0%', y2: '100%' });
    hair.appendChild(el('stop', { offset: '0%', 'stop-color': '#4a3323' }));
    hair.appendChild(el('stop', { offset: '100%', 'stop-color': '#2a1c12' }));
    defs.appendChild(hair);
    // Outfit gradient (stops updated dynamically)
    const outfit = el('linearGradient', { id: 'gradOutfit', x1: '20%', y1: '0%', x2: '85%', y2: '100%' });
    const outfitStop1 = el('stop', { offset: '0%', 'stop-color': OUTFIT_HEAVY, id: 'outfitStop1' });
    const outfitStop2 = el('stop', { offset: '100%', 'stop-color': OUTFIT_HEAVY, id: 'outfitStop2' });
    outfit.appendChild(outfitStop1); outfit.appendChild(outfitStop2);
    defs.appendChild(outfit);
    // Shadow blur
    defs.appendChild((function () {
      const f = el('filter', { id: 'auraBlur', x: '-60%', y: '-60%', width: '220%', height: '220%' });
      f.appendChild(el('feGaussianBlur', { stdDeviation: '7' }));
      return f;
    })());
    svg.appendChild(defs);

    // Aura glow (behind character, intensity/color driven by fitness)
    const aura = el('ellipse', { id: 'auraGlow', cx: 100, cy: 150, rx: 78, ry: 92, fill: 'url(#gradOutfit)', opacity: 0.16, filter: 'url(#auraBlur)' });
    svg.appendChild(aura);

    // Ground shadow
    svg.appendChild(el('ellipse', { id: 'partShadow', cx: 100, cy: 232, rx: 46, ry: 7, fill: 'rgba(0,0,0,0.35)' }));

    const body = el('g', { id: this.mount.id + 'Body' });
    svg.appendChild(body);

    // Ordered back-to-front: back leg, back arm, torso, front arm, front leg overlays handled via update()
    ['legL', 'armL', 'torso', 'outfitDetail', 'armR', 'legR', 'neck', 'head'].forEach(key => {
      const g = el('g', { id: this.mount.id + '_' + key });
      body.appendChild(g);
    });

    this.mount.appendChild(svg);
    this.svg = svg;
    this.body = body;
    this.groups = {};
    ['legL', 'armL', 'torso', 'outfitDetail', 'armR', 'legR', 'neck', 'head'].forEach(key => {
      this.groups[key] = document.getElementById(this.mount.id + '_' + key);
    });

    this._buildHead();
  };

  Character.prototype._buildHead = function () {
    const g = this.groups.head;
    g.innerHTML = '';
    // Ears
    g.appendChild(el('ellipse', { cx: 68, cy: 62, rx: 7, ry: 9, fill: 'url(#gradSkin)' }));
    g.appendChild(el('ellipse', { cx: 132, cy: 62, rx: 7, ry: 9, fill: 'url(#gradSkin)' }));
    // Head base
    g.appendChild(el('ellipse', { id: 'partHead', cx: 100, cy: 58, rx: 34, ry: 32, fill: 'url(#gradSkin)' }));
    // Cheeks / blush
    g.appendChild(el('ellipse', { cx: 76, cy: 68, rx: 9, ry: 6, fill: '#ff8a8a', opacity: 0.45 }));
    g.appendChild(el('ellipse', { cx: 124, cy: 68, rx: 9, ry: 6, fill: '#ff8a8a', opacity: 0.45 }));
    // Eyebrows
    g.appendChild(el('path', { id: 'browL', d: 'M78 46 Q86 41 94 45', stroke: '#3a2415', 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round' }));
    g.appendChild(el('path', { id: 'browR', d: 'M106 45 Q114 41 122 46', stroke: '#3a2415', 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round' }));
    // Eyes whites
    const eyeGroup = el('g', { id: 'eyeGroup' });
    eyeGroup.appendChild(el('ellipse', { cx: 86, cy: 56, rx: 7, ry: 8, fill: 'white' }));
    eyeGroup.appendChild(el('ellipse', { cx: 114, cy: 56, rx: 7, ry: 8, fill: 'white' }));
    eyeGroup.appendChild(el('circle', { id: 'pupilL', cx: 87, cy: 57, r: 4, fill: '#1a1a2e' }));
    eyeGroup.appendChild(el('circle', { id: 'pupilR', cx: 115, cy: 57, r: 4, fill: '#1a1a2e' }));
    eyeGroup.appendChild(el('circle', { cx: 89, cy: 55, r: 1.4, fill: 'white' }));
    eyeGroup.appendChild(el('circle', { cx: 117, cy: 55, r: 1.4, fill: 'white' }));
    g.appendChild(eyeGroup);
    // Nose hint
    g.appendChild(el('path', { d: 'M100 60 q3 4 0 7', stroke: '#c98452', 'stroke-width': 1.6, fill: 'none', 'stroke-linecap': 'round', opacity: 0.6 }));
    // Mouth
    g.appendChild(el('path', { id: 'partMouth', d: 'M86 76 Q100 82 114 76', stroke: '#8a4a2c', 'stroke-width': 2.6, fill: 'none', 'stroke-linecap': 'round' }));
    // Hair back tuft (behind head silhouette edges) then front fringe
    g.appendChild(el('path', { d: 'M66 46 Q64 20 100 16 Q136 20 134 46 Q120 30 100 30 Q80 30 66 46 Z', fill: 'url(#gradHair)' }));
    g.appendChild(el('path', { d: 'M70 40 Q78 30 100 29 Q122 30 130 40 L128 34 Q112 24 100 24 Q88 24 72 34 Z', fill: 'url(#gradHair)', opacity: 0.9 }));
    // Sweat drops
    const sweat = el('g', { id: 'partSweat', opacity: 0 });
    sweat.appendChild(el('path', { d: 'M62 38 q4 6 0 11 q-4 -1 -4 -6 q0 -4 4 -5', fill: '#7dd3fc' }));
    sweat.appendChild(el('path', { d: 'M140 34 q3 5 0 9 q-3 -1 -3 -5 q0 -3 3 -4', fill: '#7dd3fc' }));
    g.appendChild(sweat);
    // Sparkles (celebration / milestone)
    const spark = el('g', { id: 'partSparkle', opacity: 0 });
    [[38, 30, 6], [162, 26, 5], [26, 60, 4]].forEach(([x, y, s]) => {
      spark.appendChild(el('path', {
        d: `M${x} ${y - s} L${x + s * 0.3} ${y - s * 0.3} L${x + s} ${y} L${x + s * 0.3} ${y + s * 0.3} L${x} ${y + s} L${x - s * 0.3} ${y + s * 0.3} L${x - s} ${y} L${x - s * 0.3} ${y - s * 0.3} Z`,
        fill: '#fbbf24'
      }));
    });
    g.appendChild(spark);
  };

  Character.prototype._setOutfitColors = function (t) {
    document.getElementById('outfitStop1').setAttribute('stop-color', lerpColor(OUTFIT_HEAVY, '#2fbf6b', t));
    document.getElementById('outfitStop2').setAttribute('stop-color', lerpColor('#4b5563', OUTFIT_FIT, t));
  };

  Character.prototype.update = function (opts) {
    opts = opts || {};
    if (opts.t !== undefined) this.t = clamp01(opts.t);
    if (opts.pose) this.pose = opts.pose;
    if (opts.mood) this.mood = opts.mood;
    const t = this.t;
    const P = POSES[this.pose] || POSES.idle;
    this._setOutfitColors(t);

    // ---- Proportions driven by t ----
    const shoulderGap = lerp(66, 46, t);
    const hipGap = lerp(44, 32, t);
    const torsoRy = lerp(38, 32, t);
    const armR1 = lerp(14, 10, t), armR2 = lerp(10, 7, t);
    const legR1 = lerp(16, 11, t), legR2 = lerp(12, 9, t);
    const armLen1 = 40, armLen2 = 36;
    const legLen1 = 34, legLen2 = 32;

    const bob = P.bob;
    const cx = 100, shoulderY = 96 + bob, hipY = 150 + bob;
    const lean = P.lean;

    this.body.setAttribute('transform', `rotate(${lean} 100 150)`);

    // Shoulders / hips anchor points
    const shL = { x: cx - shoulderGap / 2, y: shoulderY };
    const shR = { x: cx + shoulderGap / 2, y: shoulderY };
    const hipL = { x: cx - hipGap / 2, y: hipY };
    const hipR = { x: cx + hipGap / 2, y: hipY };

    // ---- Arms ----
    const elL = polar(shL.x, shL.y, P.shL, armLen1);
    const wrL = polar(elL.x, elL.y, P.shL + P.elL, armLen2);
    const elR = polar(shR.x, shR.y, P.shR, armLen1);
    const wrR = polar(elR.x, elR.y, P.shR + P.elR, armLen2);

    this.groups.armL.innerHTML = '';
    this.groups.armL.appendChild(limb('url(#gradSkin)', shL.x, shL.y, armR1, elL.x, elL.y, armR2));
    this.groups.armL.appendChild(limb('url(#gradSkin)', elL.x, elL.y, armR2, wrL.x, wrL.y, armR2 * 0.8));

    this.groups.armR.innerHTML = '';
    this.groups.armR.appendChild(limb('url(#gradSkin)', shR.x, shR.y, armR1, elR.x, elR.y, armR2));
    this.groups.armR.appendChild(limb('url(#gradSkin)', elR.x, elR.y, armR2, wrR.x, wrR.y, armR2 * 0.8));

    // ---- Legs ----
    const knL = polar(hipL.x, hipL.y, P.hipL, legLen1);
    const anL = polar(knL.x, knL.y, P.hipL + P.kneeL, legLen2);
    const knR = polar(hipR.x, hipR.y, P.hipR, legLen1);
    const anR = polar(knR.x, knR.y, P.hipR + P.kneeR, legLen2);
    const shoeStripe = lerpColor(SHOE_STRIPE_HEAVY, SHOE_STRIPE_FIT, t);
    const shortsColor = lerpColor(SHORTS_HEAVY, SHORTS_FIT, t);

    function buildLeg(hip, kn, an, r1, r2) {
      const g = document.createDocumentFragment();
      g.appendChild(limb(shortsColor, hip.x, hip.y, r1, kn.x, kn.y, r1 * 0.82));
      g.appendChild(limb('url(#gradSkin)', kn.x, kn.y, r2 * 0.82, an.x, an.y, r2 * 0.72));
      // shoe
      const toe = polar(an.x, an.y, 90, 14);
      g.appendChild(limb('#161a22', an.x, an.y - 3, r2 * 0.62, toe.x, toe.y, r2 * 0.5));
      g.appendChild(el('ellipse', { cx: toe.x, cy: toe.y + 2, rx: r2 * 0.62, ry: 4, fill: shoeStripe }));
      return g;
    }
    this.groups.legL.innerHTML = '';
    this.groups.legL.appendChild(buildLeg(hipL, knL, anL, legR1, legR2));
    this.groups.legR.innerHTML = '';
    this.groups.legR.appendChild(buildLeg(hipR, knR, anR, legR1, legR2));

    // ---- Torso / outfit ----
    this.groups.torso.innerHTML = '';
    this.groups.torso.appendChild(el('ellipse', { cx, cy: (shoulderY + hipY) / 2 + 4, rx: shoulderGap / 2 + 8, ry: torsoRy, fill: 'url(#gradOutfit)' }));
    // chest highlight
    this.groups.torso.appendChild(el('ellipse', { cx: cx - 12, cy: (shoulderY + hipY) / 2 - 10, rx: 14, ry: torsoRy * 0.4, fill: 'white', opacity: 0.06 }));
    // collar
    this.groups.torso.appendChild(el('path', { d: `M${cx - 16} ${shoulderY - 4} Q${cx} ${shoulderY + 10} ${cx + 16} ${shoulderY - 4}`, stroke: 'rgba(0,0,0,0.18)', 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round' }));

    // Outfit detail: fades hoodie pocket+drawstring out, abs/racer-stripe in
    this.groups.outfitDetail.innerHTML = '';
    const hoodieOpacity = 1 - t;
    const fitOpacity = Math.max(0, t - 0.45) / 0.55;
    const pocket = el('path', { d: `M${cx - 20} ${hipY - 14} Q${cx} ${hipY - 2} ${cx + 20} ${hipY - 14} L${cx + 16} ${hipY - 4} Q${cx} ${hipY + 4} ${cx - 16} ${hipY - 4} Z`, fill: 'rgba(0,0,0,0.14)', opacity: hoodieOpacity });
    this.groups.outfitDetail.appendChild(pocket);
    const stripe = el('path', { d: `M${cx - 26} ${shoulderY + 6} L${cx - 10} ${hipY - 6}`, stroke: '#f97316', 'stroke-width': 4, 'stroke-linecap': 'round', opacity: fitOpacity });
    this.groups.outfitDetail.appendChild(stripe);
    const absTop = (shoulderY + hipY) / 2 + 2;
    [0, 1].forEach(i => {
      this.groups.outfitDetail.appendChild(el('path', {
        d: `M${cx - 6} ${absTop + i * 10} Q${cx} ${absTop + i * 10 + 3} ${cx + 6} ${absTop + i * 10}`,
        stroke: 'rgba(0,0,0,0.25)', 'stroke-width': 1.6, fill: 'none', opacity: fitOpacity * 0.7
      }));
    });

    // ---- Neck ----
    this.groups.neck.innerHTML = '';
    this.groups.neck.appendChild(limb('url(#gradSkin)', cx, shoulderY - 2, 13, cx, shoulderY - 10, 11));

    // ---- Head position (bob + lean already applied via group transform) ----
    this.groups.head.setAttribute('transform', `translate(0 ${bob * 0.3})`);

    // ---- Aura ----
    document.getElementById('auraGlow').setAttribute('opacity', (0.08 + t * 0.22).toFixed(2));
    document.getElementById('auraGlow').setAttribute('rx', String(70 + t * 14));
    document.getElementById('auraGlow').setAttribute('ry', String(88 + t * 10));

    this._applyMood();
  };

  Character.prototype._applyMood = function () {
    const mouth = document.getElementById('partMouth');
    const browL = document.getElementById('browL');
    const browR = document.getElementById('browR');
    if (!mouth) return;
    const t = this.t;
    const baseSmile = lerp(0, 10, t); // fitter = slightly happier baseline
    let curve = 78 - baseSmile, browTilt = 0;
    switch (this.mood) {
      case 'happy': curve = 66; browTilt = -4; break;
      case 'sad': curve = 88; browTilt = 6; break;
      case 'working': curve = 80; browTilt = 3; break;
      default: curve = 78 - baseSmile; browTilt = -baseSmile * 0.3;
    }
    mouth.setAttribute('d', `M86 76 Q100 ${curve} 114 76`);
    browL.setAttribute('transform', `rotate(${browTilt} 86 45)`);
    browR.setAttribute('transform', `rotate(${-browTilt} 114 45)`);
  };

  Character.prototype.showSweat = function (on) {
    const s = document.getElementById('partSweat');
    if (s) s.setAttribute('opacity', on ? '1' : '0');
  };
  Character.prototype.showSparkle = function (on) {
    const s = document.getElementById('partSparkle');
    if (s) s.style.opacity = on ? '1' : '0';
  };
  Character.prototype.blink = function () {
    const g = document.getElementById('eyeGroup');
    if (!g) return;
    g.style.transition = 'transform 90ms ease';
    g.style.transformOrigin = '100px 56px';
    g.style.transform = 'scaleY(0.15)';
    setTimeout(() => { g.style.transform = 'scaleY(1)'; }, 110);
  };
  Character.prototype.bounce = function () {
    this.mount.classList.remove('char-bounce'); void this.mount.offsetWidth;
    this.mount.classList.add('char-bounce');
  };
  Character.prototype.wiggle = function () {
    this.mount.classList.remove('char-wiggle'); void this.mount.offsetWidth;
    this.mount.classList.add('char-wiggle');
  };
  Character.prototype.setFloat = function (on) {
    this.mount.classList.toggle('char-float', !!on);
  };

  global.BTB = global.BTB || {};
  global.BTB.Character = Character;

  // Random idle blink loop, started lazily by app.js
  global.BTB.startBlinkLoop = function (charInstance) {
    function loop() {
      charInstance.blink();
      setTimeout(loop, 2600 + Math.random() * 2600);
    }
    setTimeout(loop, 1800);
  };
})(window);
