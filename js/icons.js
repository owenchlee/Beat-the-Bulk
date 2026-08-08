/* ============================================================
   BEAT THE BULK — Inline SVG icon set (no emoji, no external requests)
   ============================================================ */
(function (global) {
  const PATHS = {
    dumbbell: '<path d="M6 7v10M9 9.5v5M15 9.5v5M18 7v10M9 12h6"/>',
    chart: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
    sliders: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2" fill="currentColor" stroke="none"/><circle cx="16" cy="12" r="2" fill="currentColor" stroke="none"/><circle cx="10" cy="18" r="2" fill="currentColor" stroke="none"/>',
    flame: '<path d="M12 2c-1 4-6 6-6 11a6 6 0 0012 0c0-3-2-4-2-6-1 2-2 2-2 0 0-2 1-3-2-5z"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>',
    check: '<path d="M4 12.5l5 5 11-11"/>',
    volume: '<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 010 7"/><path d="M19 6a9 9 0 010 12"/>',
    volumeMute: '<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 9l5 6M21 9l-5 6"/>',
    edit: '<path d="M4 20l0.8-3.6L15.6 5.6a1.5 1.5 0 012.1 0l0.7.7a1.5 1.5 0 010 2.1L7.6 19.2 4 20z"/><path d="M14.2 7.2l2.6 2.6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
    heart: '<path d="M12 20s-7-4.4-9.5-9A5.4 5.4 0 0112 5.4 5.4 5.4 0 0121.5 11c-2.5 4.6-9.5 9-9.5 9z"/>',
    bolt: '<path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    trophy: '<path d="M8 3h8v5a4 4 0 01-8 0V3z"/><path d="M8 5H5a3 3 0 003 3"/><path d="M16 5h3a3 3 0 01-3 3"/><path d="M12 12v4"/><path d="M8 20h8"/><path d="M9 20v-2.5c0-.8.6-1.5 1.4-1.5h3.2c.8 0 1.4.7 1.4 1.5V20"/>',
    play: '<path d="M8 5l12 7-12 7V5z" fill="currentColor" stroke="none"/>',
    pause: '<rect x="7" y="5" width="4" height="14" fill="currentColor" stroke="none"/><rect x="13" y="5" width="4" height="14" fill="currentColor" stroke="none"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4V8z"/><circle cx="12" cy="13.5" r="3.2"/>',
    chevronDown: '<path d="M6 9l6 6 6-6"/>',
    sparkle: '<path d="M12 2l2.2 6.8L21 11l-6.8 2.2L12 20l-2.2-6.8L3 11l6.8-2.2z" fill="currentColor" stroke="none"/>',
    scale: '<path d="M12 3v3M6 6h12M6 6l-3 7a3 3 0 006 0L6 6M18 6l-3 7a3 3 0 006 0l-3-7M9 21h6"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    footprint: '<path d="M9 3c2 0 3 2 3 5s-1 5-3 5-3-1-3-3 1-7 3-7z"/><path d="M15 11c2 0 3 3 3 6s-1 4-3 4-3-1-3-3 1-7 3-7z"/>',
    share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.6l7.6-4.2M8.2 13.4l7.6 4.2"/>'
  };

  function iconMarkup(name, size) {
    const p = PATHS[name] || PATHS.check;
    size = size || 20;
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  }

  global.BTB = global.BTB || {};
  global.BTB.icon = iconMarkup;
})(window);
