/*
 * The explainer video, as one timeline. Everything on screen is a function
 * of time: seek(t) draws the frame at t seconds. render.py steps it frame by
 * frame; opened in a browser it just plays (space pauses, ← → step).
 *
 * The story (docs/explainer/script.md): your seed phrase is the password to
 * a secret cave; the derivation path is the torch-lit trail through its
 * tunnels to the chambers where your coins are (your addresses); every
 * wallet app lit its own trail; Derivation Path knows them all. The cave is
 * drawn here. The app's scenes play real screens from video/captures/
 * (capture.py): taps land on the marks capture.py recorded, and close-ups
 * aim at them, so they follow the UI when it moves. The cave's chambers show
 * the demo wallet (demo.js) the app later finds.
 */

const W = 720;
const H = 1280;
const GOLD = "#FFAF00"; // the site's gold
const FLAME = "#FF8A1F";
const BURST_FPS = 15;

const stage = document.getElementById("stage");
const MARKS = window.MARKS || {};
const BURSTS = window.BURSTS || {};
const DEMO = window.DEMO;

// ---------------------------------------------------------------- helpers

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const linear = (t) => t;
/** 0→1 across [a, b], eased */
const ramp = (t, a, b, fn = ease) => fn(clamp((t - a) / (b - a)));
/** 0 → 1 → 0 across [a, b], peaking in the middle */
const bump = (t, a, b) => (t <= a || t >= b ? 0 : Math.sin(((t - a) / (b - a)) * Math.PI));
/** A torch's unsteady brightness around 1: never repeats visibly, always the same at t. */
const flicker = (t, seed = 0) =>
  1 + 0.07 * Math.sin(t * 13.1 + seed) + 0.05 * Math.sin(t * 23.7 + seed * 2.3) + 0.035 * Math.sin(t * 41.3 + seed * 4.1);
/** Seeded random numbers, so the cave looks the same in every frame and every render. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const fmtSats = (n) => n.toLocaleString("en-US");
const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function el(tag, cls, parent, style) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (style) Object.assign(e.style, style);
  if (parent) parent.appendChild(e);
  return e;
}
const NS = "http://www.w3.org/2000/svg";
function svg(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}
function svgRoot(parent, w, h, style) {
  const s = svg("svg", { width: w, height: h, viewBox: `0 0 ${w} ${h}`, class: "fill" }, parent);
  if (style) Object.assign(s.style, style);
  return s;
}

const CAM_DEFAULT = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, s: 1, o: 1, blur: 0, scroll: 0 };

/** Values at t from keyframes [[time, {props}], …]; frames only list what changes. */
function kf(frames, t, base = CAM_DEFAULT) {
  const filled = [];
  let acc = { ...base };
  for (const [time, props] of frames) {
    acc = { ...acc, ...props };
    filled.push([time, acc]);
  }
  if (t <= filled[0][0]) return { ...filled[0][1] };
  for (let i = 0; i < filled.length - 1; i++) {
    const [ta, a] = filled[i];
    const [tb, b] = filled[i + 1];
    if (t <= tb) {
      const p = ease(clamp((t - ta) / (tb - ta)));
      const out = {};
      for (const k of Object.keys(base)) out[k] = lerp(a[k], b[k], p);
      return out;
    }
  }
  return { ...filled[filled.length - 1][1] };
}

// ------------------------------------------------------------ the cave kit

/**
 * Rough rock, as a picture: a few octaves of value noise in warm grays,
 * drawn once to a canvas (half size, it's soft anyway) and reused, so no
 * filter has to be re-rasterised while the camera moves.
 */
const textures = {};
function rockTexture(seed = 7) {
  if (textures[seed]) return textures[seed];
  const w = 360;
  const h = 640;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  const img = g.createImageData(w, h);
  const r = rng(seed);
  const octaves = [[64, 0.5], [24, 0.27], [9, 0.15], [3, 0.08]].map(([cell, amp]) => {
    const gw = Math.ceil(w / cell) + 2;
    const gh = Math.ceil(h / cell) + 2;
    return { cell, amp, gw, v: Float32Array.from({ length: gw * gh }, r) };
  });
  const sm = (x) => x * x * (3 - 2 * x);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (const o of octaves) {
        const fx = x / o.cell;
        const fy = y / o.cell;
        const ix = Math.floor(fx);
        const iy = Math.floor(fy);
        const tx = sm(fx - ix);
        const ty = sm(fy - iy);
        const at = (i, j) => o.v[j * o.gw + i];
        v += o.amp * lerp(lerp(at(ix, iy), at(ix + 1, iy), tx), lerp(at(ix, iy + 1), at(ix + 1, iy + 1), tx), ty);
      }
      const i = (y * w + x) * 4;
      const l = 40 + v * 90;
      img.data[i] = l * 1.08;
      img.data[i + 1] = l * 0.97;
      img.data[i + 2] = l * 0.84;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  textures[seed] = c.toDataURL("image/jpeg", 0.9);
  return textures[seed];
}

/** Rock texture laid over what's under it, so flat shapes read as stone. */
function grain(parent, opacity = 0.55, seed = 7, extra = {}) {
  return el("div", "layer", parent, {
    backgroundImage: `url(${rockTexture(seed)})`,
    backgroundSize: `${W}px ${H}px`,
    mixBlendMode: "overlay",
    opacity: String(opacity),
    pointerEvents: "none",
    ...extra,
  });
}

/**
 * Darkness with holes where there's light. `set(lights, ambient)` takes
 * [{x, y, r, k}] in this layer's coordinates: each is a pool of torchlight
 * (the darkness is kept only where every light's mask says dark), with a
 * warm glow on top. Ambient 0 is black, 1 no darkness at all.
 */
function darkness(parent, box = { left: 0, top: 0, width: W, height: H }, z = 10) {
  const dark = el("div", null, parent, {
    position: "absolute", left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px`,
    zIndex: z, pointerEvents: "none",
  });
  const warm = el("div", null, parent, {
    position: "absolute", left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px`,
    zIndex: z + 1, pointerEvents: "none", mixBlendMode: "screen",
  });
  return (lights, ambient = 0.06) => {
    const ox = -box.left;
    const oy = -box.top;
    dark.style.background = `rgba(5, 4, 3, ${1 - ambient})`;
    if (!lights.length) {
      dark.style.maskImage = "none";
      warm.style.background = "none";
      return;
    }
    const holes = lights.map(
      (l) => `radial-gradient(circle ${Math.max(1, l.r)}px at ${l.x + ox}px ${l.y + oy}px, rgba(0,0,0,${1 - l.k}) 0%, rgba(0,0,0,${1 - 0.72 * l.k}) 42%, #000 100%)`,
    );
    dark.style.maskImage = holes.join(",");
    dark.style.maskComposite = holes.map(() => "intersect").join(",");
    warm.style.background = lights
      .map((l) => `radial-gradient(circle ${Math.max(1, l.r * 0.8)}px at ${l.x + ox}px ${l.y + oy}px, rgba(255,150,40,${0.26 * l.k}) 0%, rgba(255,110,20,${0.09 * l.k}) 45%, transparent 80%)`)
      .join(",");
  };
}

/**
 * A torch: a wooden handle, a flame of three tongues that sway and stretch,
 * a glow, and embers drifting up. `draw(t, x, y, size, lit)` puts the tip
 * of the handle at (x, y); lit 0…1 grows the flame from nothing.
 */
function torch(parent, { seed = 1, handle = true, z = 20 } = {}) {
  const root = el("div", null, parent, { position: "absolute", left: "0", top: "0", zIndex: z, pointerEvents: "none" });
  const glow = el("div", null, root, {
    position: "absolute", width: "260px", height: "260px", left: "-130px", top: "-190px", borderRadius: "50%",
    background: "radial-gradient(circle, rgba(255,170,50,0.55), rgba(255,120,20,0.18) 45%, transparent 70%)",
    filter: "blur(8px)", mixBlendMode: "screen",
  });
  let stick = null;
  if (handle) {
    stick = el("div", null, root, {
      position: "absolute", width: "18px", height: "120px", left: "-9px", top: "-6px", borderRadius: "6px 6px 9px 9px",
      background: "linear-gradient(90deg, #3a2414, #6b4426 45%, #2a190d)", boxShadow: "0 0 0 2px rgba(0,0,0,0.3)",
    });
    el("div", null, stick, {
      position: "absolute", left: "-5px", right: "-5px", top: "0", height: "22px", borderRadius: "5px",
      background: "linear-gradient(90deg, #2b2b2b, #5a5550 50%, #242424)",
    });
  }
  const box = el("div", null, root, { position: "absolute", width: "100px", height: "160px", left: "-50px", top: "-152px" });
  const s = svgRoot(box, 100, 160, { overflow: "visible" });
  const TONGUE = "M50 150 C 22 150 14 120 24 98 C 33 78 44 62 50 18 C 56 62 67 78 76 98 C 86 120 78 150 50 150 Z";
  const tongues = [
    { fill: "#C2410C", sx: 1.12, sy: 1.02, o: 0.85, k: 1.2 },
    { fill: FLAME, sx: 0.92, sy: 0.92, o: 0.95, k: 1.0 },
    { fill: GOLD, sx: 0.66, sy: 0.72, o: 1, k: 0.8 },
    { fill: "#FFF1C2", sx: 0.36, sy: 0.42, o: 1, k: 0.6 },
  ].map((f) => ({ ...f, path: svg("path", { d: TONGUE, fill: f.fill, opacity: f.o, style: "transform-origin: 50px 150px" }, s) }));
  const r = rng(seed * 97);
  const embers = Array.from({ length: 9 }, () => {
    const e = el("div", null, root, {
      position: "absolute", width: "5px", height: "5px", borderRadius: "50%", background: "#FFD27A",
      boxShadow: "0 0 8px #FFAF00", opacity: "0",
    });
    return { e, phase: r(), speed: 0.55 + r() * 0.5, drift: (r() - 0.5) * 60, wob: r() * 6 };
  });
  return {
    root,
    draw(t, x, y, size = 1, lit = 1) {
      root.style.transform = `translate(${x}px, ${y}px) scale(${size})`;
      const f = flicker(t, seed);
      glow.style.opacity = String(lit * clamp(f - 0.1, 0, 1.2));
      glow.style.transform = `scale(${0.8 + 0.3 * lit * f})`;
      tongues.forEach((tg, i) => {
        const sway = Math.sin(t * (6.3 + i) + seed + i) * 6 * tg.k + Math.sin(t * 11.7 + i * 2) * 3;
        const stretch = 1 + 0.12 * Math.sin(t * (9 + i * 1.7) + seed * 3) + 0.06 * Math.sin(t * 17.3 + i);
        tg.path.style.transform = `scale(${tg.sx * lit}, ${tg.sy * stretch * lit}) skewX(${sway}deg)`;
      });
      for (const m of embers) {
        const p = (t * m.speed + m.phase) % 1;
        m.e.style.opacity = String(lit * Math.sin(p * Math.PI) * 0.9);
        m.e.style.transform = `translate(${m.drift * p + Math.sin(t * 3 + m.wob) * 8}px, ${-110 - p * 150}px) scale(${1 - p * 0.6})`;
      }
    },
  };
}

/** Dust hanging in the air, catching the light. */
function dust(parent, n = 40, seed = 3, area = { x: 0, y: 0, w: W, h: H }) {
  const r = rng(seed);
  const motes = Array.from({ length: n }, () => ({
    e: el("div", null, parent, {
      position: "absolute", width: "3px", height: "3px", borderRadius: "50%", background: "#FFE2A8",
      opacity: "0", zIndex: 30, pointerEvents: "none",
    }),
    x: area.x + r() * area.w, y: area.y + r() * area.h, p: r() * 10, s: 0.5 + r(),
  }));
  return (t, k = 1) => {
    for (const m of motes) {
      const x = m.x + Math.sin(t * 0.3 * m.s + m.p) * 30;
      const y = m.y + Math.cos(t * 0.23 * m.s + m.p) * 24 - t * 6 * m.s;
      m.e.style.transform = `translate(${x}px, ${y}px) scale(${m.s})`;
      m.e.style.opacity = String(k * (0.25 + 0.35 * Math.sin(t * 0.8 * m.s + m.p) ** 2));
    }
  };
}

/** A gold glint: a small star that twinkles, where coins catch the light. */
function glint(parent, x, y, size = 28, z = 25) {
  const e = el("div", null, parent, {
    position: "absolute", left: `${x - size / 2}px`, top: `${y - size / 2}px`, width: `${size}px`, height: `${size}px`, zIndex: z,
    pointerEvents: "none", opacity: "0",
  });
  e.innerHTML =
    `<svg viewBox="0 0 24 24" width="${size}" height="${size}" style="overflow:visible;filter:drop-shadow(0 0 6px ${GOLD})">` +
    `<path d="M12 0 C12.8 8 16 11.2 24 12 C16 12.8 12.8 16 12 24 C11.2 16 8 12.8 0 12 C8 11.2 11.2 8 12 0Z" fill="#FFE7A3"/></svg>`;
  return (t, k = 1, phase = 0) => {
    const tw = 0.55 + 0.45 * Math.sin(t * 3.1 + phase);
    e.style.opacity = String(k * tw);
    e.style.transform = `scale(${0.6 + 0.5 * tw * k}) rotate(${t * 20 + phase * 40}deg)`;
  };
}

/** A few coins stacked in a chamber, lit gold. */
function coinPile(parent, x, y, size = 1, z = 15) {
  const e = el("div", null, parent, { position: "absolute", left: `${x}px`, top: `${y}px`, zIndex: z, opacity: "0" });
  const s = svgRoot(e, 120, 80, { left: "-60px", top: "-60px", overflow: "visible", transform: `scale(${size})` });
  const coin = (cx, cy, rx) => {
    svg("ellipse", { cx, cy: cy + 5, rx, ry: rx * 0.36, fill: "#8a5a00" }, s);
    svg("rect", { x: cx - rx, y: cy, width: rx * 2, height: 5, fill: "#b77900" }, s);
    svg("ellipse", { cx, cy, rx, ry: rx * 0.36, fill: GOLD, stroke: "#FFE08A", "stroke-width": 1.5 }, s);
  };
  [[40, 62, 20], [80, 64, 18], [60, 58, 20], [48, 50, 19], [72, 52, 18], [60, 42, 20], [58, 33, 18]].forEach(([cx, cy, rx]) => coin(cx, cy, rx));
  return e;
}

/** The BitcoinSV mark (the site's logo): gold disc, white ₿. */
const LOGO =
  '<svg viewBox="0 0 2500 2500" width="100%" height="100%"><path fill="#EAB300" d="M2496,1149c56,688-457,1292-1145,1347c-67,5-135,5-203,0C543,2448,52,1957,4,1351C-52,663,461,59,1149,4 c67-5,135-5,203,0C1957,52,2448,543,2496,1149z"/><path fill="#FFFFFF" d="M1608,1206c74-51,125-109,125-217c0-172-172-253-276-264c-9-1-32-2-32-2V558h-170l1,165h-114V559H969v163 c-30,1-213,1-213,1v146c0,0,46,0,60,0c57,0,84,36,84,61v9v630c-1,22-17,39-39,41c-26,1-65,0-65,0l-33,166h208v166h173v-166h114 v166h169v-166c0,0,9,0,12,0c196,0,366-116,369-303c2-154-129-243-199-268L1608,1206z M1143,1131V880c23,0,109,0,160,0 c5,0,9,1,13,1c70,3,113,31,136,64c14,20,22,44,22,68c0,17-3,34-9,50c-5,14-12,27-22,39c-8,10-16,18-26,25c-26,19-63,32-114,35 c-1,0-158,1-161,0v-31H1143z M1526,1502c-5,15-13,29-23,42c-8,11-18,19-29,27c-28,20-67,36-124,38c-1,0-205,1-207,1v-305 c25,0,151,1,206,1c5,0,9,1,15,1c75,4,122,33,147,70c15,22,24,47,25,74c-2,18-5,36-10,53l0,0V1502z"/></svg>';

/** The site's brand: the mark and "Derivation Path", as in its top bar. */
function brand(parent, size = 44, style = {}) {
  const row = el("div", null, parent, { display: "flex", alignItems: "center", gap: `${size * 0.32}px`, ...style });
  el("div", null, row, { width: `${size}px`, height: `${size}px`, flexShrink: "0" }).innerHTML = LOGO;
  const word = el("div", null, row, { color: "#fff", fontSize: `${size * 0.8}px`, fontWeight: "700", letterSpacing: "-0.02em", whiteSpace: "nowrap" });
  word.innerHTML = 'Derivation <span style="font-weight:600;opacity:0.6">Path</span>';
  return row;
}

const WALLET_ICON = (file) => `../public/wallets/${file}`;

// ------------------------------------------------------------ backgrounds

/** Where the app's phones sit: dark rock, lit warm from one side by a torch just out of frame. */
function studio(parent) {
  const bg = el("div", "layer", parent, {
    background: "radial-gradient(120% 75% at 50% 42%, #221c16 0%, #0f0d0b 55%, #070605 100%)",
  });
  grain(bg, 0.5, 11);
  const glow = el("div", "blob", bg, {
    width: "640px", height: "640px", left: "-160px", top: "260px", background: "rgba(255,150,40,0.24)",
  });
  const glow2 = el("div", "blob", bg, {
    width: "420px", height: "420px", left: "420px", top: "760px", background: "rgba(255,175,0,0.12)",
  });
  const air = dust(bg, 26, 5);
  return (t) => {
    const f = flicker(t, 2);
    glow.style.opacity = String(0.8 * f);
    glow.style.transform = `translate(${Math.sin(t * 0.5) * 30}px, ${Math.cos(t * 0.4) * 20}px) scale(${0.95 + 0.05 * f})`;
    glow2.style.transform = `translate(${Math.sin(t * 0.3) * -40}px, 0)`;
    air(t, 0.6);
  };
}

/**
 * Curved ribbons of light behind the titles: a wide soft band with a crisp
 * bright line inside it, on black, like torchlight across a lens.
 */
const LOOKS = {
  gold: [
    { color: "#b86a00", thick: 120, blur: 60, w: 1700, h: 1200, x: -560, y: 640, rot: -14, o: 0.9 },
    { color: GOLD, thick: 34, blur: 16, w: 1600, h: 1100, x: -500, y: 700, rot: -12, o: 0.95 },
    { color: "#FFE58A", thick: 5, blur: 2, w: 1560, h: 1080, x: -480, y: 716, rot: -12, o: 0.8 },
    { color: "#5a4a3a", thick: 90, blur: 70, w: 1200, h: 900, x: 140, y: -760, rot: 168, o: 0.5 },
  ],
  gray: [
    { color: "#5d6168", thick: 130, blur: 64, w: 1700, h: 1100, x: -500, y: -620, rot: 172, o: 0.85 },
    { color: "#C9CCD1", thick: 30, blur: 14, w: 1600, h: 1040, x: -450, y: -560, rot: 172, o: 0.8 },
    { color: "#ffffff", thick: 4, blur: 1.5, w: 1570, h: 1020, x: -436, y: -548, rot: 172, o: 0.6 },
    { color: GOLD, thick: 60, blur: 40, w: 1300, h: 900, x: -100, y: 900, rot: -8, o: 0.55 },
  ],
  ember: [
    { color: "#4a2600", thick: 170, blur: 80, w: 1800, h: 1300, x: -700, y: 560, rot: 18, o: 1 },
    { color: "#d9780f", thick: 40, blur: 20, w: 1650, h: 1150, x: -620, y: 640, rot: 18, o: 0.9 },
    { color: "#FFD54A", thick: 4, blur: 1.5, w: 1610, h: 1120, x: -600, y: 658, rot: 18, o: 0.75 },
    { color: "#3b3530", thick: 100, blur: 70, w: 1100, h: 800, x: 200, y: -600, rot: 190, o: 0.6 },
  ],
};

function ribbons(parent, look) {
  const bg = el("div", "layer", parent, { background: "#070605" });
  const made = LOOKS[look].map((r, i) => ({
    ...r,
    i,
    node: el("div", null, bg, {
      position: "absolute", left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px`,
      borderRadius: "50%", border: `${r.thick}px solid transparent`, borderTopColor: r.color,
      filter: `blur(${r.blur}px)`, opacity: r.o,
    }),
  }));
  // edges fall off to black
  el("div", "layer", bg, { background: "radial-gradient(90% 70% at 50% 50%, transparent 55%, rgba(0,0,0,0.55) 100%)" });
  return (t) => {
    for (const r of made) {
      const sway = Math.sin(t * 0.5 + (r.i < 3 ? 0 : 2)) * 3;
      const drift = Math.sin(t * 0.35 + (r.i < 3 ? 0 : 1.3)) * 40;
      r.node.style.transform = `translateX(${drift}px) rotate(${r.rot + sway}deg)`;
    }
  };
}

/**
 * The horizon, like an eclipse: a black world whose edge glows gold, light
 * spilling softly below it, a highlight gliding along the rim.
 */
function horizon(parent) {
  const bg = el("div", "layer", parent, { background: "#040303" });
  const spill = el("div", null, bg, {
    position: "absolute", left: "-200px", right: "-200px", top: "760px", height: "700px",
    background: "radial-gradient(60% 55% at 50% 0%, rgba(255,160,0,0.55) 0%, rgba(120,70,0,0.35) 40%, transparent 75%)",
    filter: "blur(20px)",
  });
  const halo = el("div", null, bg, {
    position: "absolute", left: "-1040px", top: "-1880px", width: "2800px", height: "2800px", borderRadius: "50%",
    boxShadow: "0 0 70px 18px rgba(255,170,0,0.75), 0 0 220px 70px rgba(255,150,0,0.35)",
  });
  const world = el("div", null, bg, {
    position: "absolute", left: "-1040px", top: "-1880px", width: "2800px", height: "2800px", borderRadius: "50%",
    background: "radial-gradient(50% 50% at 50% 42%, #0b0a09 70%, #13110f 100%)",
    borderBottom: "2px solid rgba(255,229,138,0.9)",
  });
  const glintBlob = el("div", "blob", bg, {
    width: "240px", height: "90px", top: "880px", left: "240px", background: "#FFE58A", filter: "blur(40px)", opacity: "0.7",
  });
  return (t) => {
    const lift = Math.sin(t * 0.5) * 10;
    for (const e of [halo, world, spill]) e.style.transform = `translateY(${lift}px)`;
    glintBlob.style.transform = `translate(${Math.sin(t * 0.45) * 220}px, ${lift - Math.abs(Math.sin(t * 0.45)) * 30}px)`;
  };
}

// ------------------------------------------------------------------ titles

function titleText(root, text, style = {}) {
  const box = el("div", "title", root, style);
  // "\n" starts a new line; *starred* words blur in last, in gold
  const words = [];
  text.split(/(\*[^*]+\*|\n)/).filter(Boolean).forEach((part) => {
    if (part === "\n") return el("br", null, box);
    const emph = part.startsWith("*");
    const span = el("span", null, box, emph ? { color: "#FFD27A" } : {});
    span.textContent = emph ? part.slice(1, -1) : part;
    words.push({ span, emph });
  });
  return {
    box,
    draw(t) {
      box.style.transform = `translateY(-50%) scale(${1 + t * 0.012})`;
      for (const w of words) {
        const p = w.emph ? ramp(t, 0.3, 0.95, easeOut) : ramp(t, 0, 0.35, easeOut);
        w.span.style.opacity = p;
        w.span.style.filter = `blur(${(1 - p) * (w.emph ? 16 : 6)}px)`;
        w.span.style.transform = `translateX(${(1 - p) * (w.emph ? 14 : 0)}px)`;
      }
    },
  };
}

/** "Your coins aren't *lost*": the starred words blur into focus after the rest. */
const title = (text, look, dur) => {
  const plain = text.replace(/\*/g, "").replace(/\s*\n\s*/g, " ");
  return {
    label: `“${plain}”`,
    kind: "title",
    dur: dur ?? Math.round(clamp(1.35 + plain.length * 0.03, 1.6, 2.3) * 10) / 10,
    build(root, start) {
      const bg = look === "horizon" ? horizon(root) : ribbons(root, look);
      const tx = titleText(root, text);
      return (t) => {
        bg(start + t);
        tx.draw(t);
      };
    },
  };
};

// ----------------------------------------------------------- cave scenes

/** A scene drawn from scratch: `build(root, start)` returns draw(t). */
const cave = (label, dur, build) => ({ label, kind: "cave", dur, build });

/** Scene 1: the mountain at night, a cave mouth, a torch by it, coins glinting deep inside. */
function coldOpen(root) {
  const world = el("div", "layer", root, { transformOrigin: "360px 760px" });
  el("div", "layer", world, { background: "linear-gradient(#070a12 0%, #0b0d14 45%, #120f0c 100%)" });
  // stars
  const r = rng(21);
  const stars = Array.from({ length: 70 }, () => ({
    e: el("div", null, world, {
      position: "absolute", left: `${r() * W}px`, top: `${r() * 520}px`, width: "2px", height: "2px",
      borderRadius: "50%", background: "#fff",
    }),
    p: r() * 6, k: 0.3 + r() * 0.7,
  }));
  const s = svgRoot(world, W, H);
  svg("path", { d: "M-40 640 L90 470 L180 540 L300 380 L420 520 L520 430 L640 560 L760 480 L760 1280 L-40 1280Z", fill: "#15161c" }, s);
  svg("path", { d: "M-40 760 L60 640 L170 700 L250 590 L380 520 L500 610 L600 560 L760 690 L760 1280 L-40 1280Z", fill: "#1d1a17" }, s);
  // the cliff and its mouth
  svg("path", { d: "M-40 900 C 80 780 150 700 260 660 C 330 632 400 628 470 650 C 580 690 660 780 760 860 L760 1280 L-40 1280Z", fill: "#2a231d" }, s);
  const mouth = "M232 1120 C 226 960 262 842 318 790 C 346 764 386 760 414 786 C 468 836 500 950 494 1120 Z";
  svg("path", { d: mouth, fill: "#030202" }, s);
  svg("path", { d: mouth, fill: "none", stroke: "#4a3b2e", "stroke-width": 10, opacity: 0.8 }, s);
  // deep inside: the faintest warmth
  const deep = el("div", "blob", world, {
    width: "150px", height: "200px", left: "290px", top: "880px", background: "rgba(255,160,40,0.18)", filter: "blur(40px)",
  });
  const g = [glint(world, 330, 1000, 22), glint(world, 398, 962, 16), glint(world, 372, 1060, 18)];
  // the ground
  svg("path", { d: "M-40 1120 C 180 1100 540 1100 760 1130 L760 1280 L-40 1280Z", fill: "#171310" }, s);
  grain(world, 0.6, 3);
  const light = darkness(world, { left: -200, top: -200, width: W + 400, height: H + 400 });
  const fire = torch(world, { seed: 4 });
  const air = dust(world, 30, 9, { x: 60, y: 780, w: 600, h: 420 });
  return (t) => {
    world.style.transform = `scale(${1 + ramp(t, 0, 6.8, linear) * 0.28})`;
    for (const st of stars) st.e.style.opacity = String(st.k * (0.5 + 0.5 * Math.sin(t * 1.3 + st.p)));
    const f = flicker(t, 4);
    const lit = ramp(t, 0.1, 1.2, easeOut);
    fire.draw(t, 560, 990, 0.95, lit);
    light([{ x: 560, y: 900, r: 460 * f * lit + 1, k: 0.95 * lit }, { x: 360, y: 980, r: 180, k: 0.25 * ramp(t, 1.5, 3.5) }], 0.16);
    deep.style.opacity = String(0.6 + 0.4 * Math.sin(t * 1.1));
    g.forEach((gl, i) => gl(t, ramp(t, 2 + i * 0.5, 3 + i * 0.5), i * 2));
    air(t, lit * 0.8);
  };
}

/** Scene 4: the stone door, its twelve words lighting one by one, then rolling open. */
function door(root, start) {
  const world = el("div", "layer", root, { transformOrigin: "360px 640px" });
  el("div", "layer", world, { background: "#1a1511" });
  grain(world, 0.75, 17);
  // the frame the door sits in, cut into the rock
  const s = svgRoot(world, W, H);
  svg("path", { d: "M70 1180 L70 430 C 70 250 200 150 360 150 C 520 150 650 250 650 430 L650 1180 Z", fill: "#0e0b09" }, s);
  svg("path", { d: "M70 1180 L70 430 C 70 250 200 150 360 150 C 520 150 650 250 650 430 L650 1180", fill: "none", stroke: "#3a2f25", "stroke-width": 16 }, s);
  // behind the door: warm light waiting
  const beyond = el("div", null, world, {
    position: "absolute", left: "86px", top: "166px", width: "548px", height: "1014px",
    borderRadius: "274px 274px 0 0", background: "radial-gradient(70% 60% at 50% 55%, #FFE2A0 0%, #FFAF00 30%, #8a4a00 70%, #2a1600 100%)", opacity: "0",
  });
  // the two halves of the slab
  const halves = [0, 1].map((i) => {
    const h = el("div", null, world, {
      position: "absolute", top: "166px", width: "274px", height: "1014px", left: `${86 + i * 274}px`, overflow: "hidden",
      borderRadius: i ? "0 274px 0 0" : "274px 0 0 0",
      background: "linear-gradient(180deg, #3b3129, #2a221c)", boxShadow: "inset 0 0 0 3px rgba(255,220,170,0.05)",
    });
    grain(h, 0.8, 23 + i, { width: `${W}px`, height: `${H}px`, left: `${-i * 274}px` });
    return h;
  });
  // the seam
  const seam = el("div", null, world, { position: "absolute", left: "358px", top: "166px", width: "4px", height: "1014px", background: "#0b0908" });
  // twelve words, carved in, numbered like a seed phrase: six a side, so each
  // half of the door carries its own words away when it opens
  const words = DEMO.phrase.split(" ");
  const tablets = words.map((w, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const half = halves[col];
    const tab = el("div", null, half, {
      position: "absolute", left: col ? "34px" : "76px", top: `${250 + row * 100}px`, width: "164px", height: "82px",
      borderRadius: "16px", background: "rgba(0,0,0,0.28)", boxShadow: "inset 0 3px 6px rgba(0,0,0,0.6), 0 1px 0 rgba(255,230,190,0.08)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "2px",
    });
    const n = el("div", null, tab, { fontSize: "15px", fontWeight: "800", color: "rgba(255,230,190,0.35)" });
    n.textContent = String(i + 1);
    const t = el("div", null, tab, { fontSize: "28px", fontWeight: "800", color: "#6d5b48", letterSpacing: "-0.01em" });
    t.textContent = w;
    return { tab, n, t, at: 3.0 + i * 0.22 };
  });
  const label = el("div", "caps", world, { position: "absolute", left: "0", right: "0", top: "360px", textAlign: "center", fontSize: "17px", color: "rgba(255,225,180,0.6)", zIndex: 5 });
  label.textContent = "Your seed phrase";
  const light = darkness(world, { left: -300, top: -300, width: W + 600, height: H + 600 }, 10);
  const fires = [torch(world, { seed: 7 }), torch(world, { seed: 9 })];
  const rays = el("div", null, world, {
    position: "absolute", left: "-100px", top: "100px", width: "920px", height: "1200px", zIndex: 12, opacity: "0",
    background: "conic-gradient(from 180deg at 50% 40%, transparent 0deg, rgba(255,200,90,0.22) 8deg, transparent 16deg, rgba(255,200,90,0.18) 28deg, transparent 40deg, rgba(255,200,90,0.2) 320deg, transparent 332deg, rgba(255,200,90,0.16) 344deg, transparent 356deg)",
    mixBlendMode: "screen", filter: "blur(6px)",
  });
  const air = dust(world, 40, 13, { x: 60, y: 200, w: 600, h: 1000 });
  const OPEN = 6.2;
  return (t) => {
    const open = ramp(t, OPEN, OPEN + 1.7, ease);
    world.style.transform = `scale(${1 + ramp(t, 0, OPEN, linear) * 0.05 + open * 0.55}) translateY(${open * 40}px)`;
    tablets.forEach((tb, i) => {
      const on = ramp(t, tb.at, tb.at + 0.25, easeOut);
      const all = bump(t, 5.7, 6.4);
      tb.t.style.color = on > 0 ? `rgb(${lerp(109, 255, on)}, ${lerp(91, 214, on)}, ${lerp(72, 140, on)})` : "#6d5b48";
      tb.t.style.textShadow = on > 0 ? `0 0 ${14 * on + 16 * all}px rgba(255,175,0,${0.7 * on})` : "none";
      tb.tab.style.boxShadow = `inset 0 3px 6px rgba(0,0,0,0.6), 0 0 0 ${2 * on}px rgba(255,175,0,${0.45 * on + 0.4 * all})`;
      tb.tab.style.transform = `scale(${1 + 0.08 * bump(t, tb.at, tb.at + 0.35)})`;
      void i;
    });
    label.style.opacity = String(ramp(t, 2.6, 3.2) * (1 - open));
    halves[0].style.transform = `translateX(${-open * 300}px)`;
    halves[1].style.transform = `translateX(${open * 300}px)`;
    seam.style.opacity = String(1 - ramp(t, OPEN, OPEN + 0.2));
    beyond.style.opacity = String(ramp(t, OPEN, OPEN + 0.8));
    rays.style.opacity = String(ramp(t, OPEN + 0.3, OPEN + 1.4) * (0.8 + 0.2 * flicker(t, 3)));
    const f1 = flicker(t, 7);
    const f2 = flicker(t, 9);
    fires[0].draw(t, 36, 640, 0.9, ramp(t, 0.1, 0.9, easeOut));
    fires[1].draw(t, 684, 640, 0.9, ramp(t, 0.5, 1.3, easeOut));
    light(
      [
        { x: 36, y: 560, r: 520 * f1, k: 0.9 },
        { x: 684, y: 560, r: 520 * f2, k: 0.9 },
        { x: 360, y: 700, r: 900 * open + 1, k: open },
      ],
      0.1,
    );
    air(t, 0.5 + open * 0.5);
    void start;
  };
}

/**
 * Scene 5: inside, in the dark. A tunnel network, branching again and again,
 * shows faintly as your eyes adjust; three far chambers glint gold.
 */
function tunnels(root) {
  const world = el("div", "layer", root, { transformOrigin: "360px 160px" });
  el("div", "layer", world, { background: "#0c0a08" });
  const s = svgRoot(world, W, H);
  const r = rng(5);
  const WIDTHS = [26, 18, 12, 8, 5, 3.2];
  const FAN = [3, 3, 3, 2, 2, 2];
  const leaves = [];
  const segs = [];
  function grow(x, y, depth, spread) {
    if (depth === FAN.length) {
      leaves.push([x, y]);
      return;
    }
    const n = FAN[depth];
    for (let i = 0; i < n; i++) {
      const nx = x + (n === 1 ? 0 : (i / (n - 1) - 0.5) * spread) + (r() - 0.5) * spread * 0.18;
      const ny = y + 150 + r() * 40 + depth * 8;
      segs.push({ x, y, nx, ny, depth });
      grow(nx, ny, depth + 1, spread / n * 1.15);
    }
  }
  grow(360, 150, 0, 660);
  for (const pass of [0, 1]) {
    for (const g of segs) {
      const my = (g.y + g.ny) / 2;
      svg("path", {
        d: `M${g.x} ${g.y} C ${g.x} ${my} ${g.nx} ${my} ${g.nx} ${g.ny}`,
        fill: "none", "stroke-linecap": "round",
        stroke: pass ? "#0d0b09" : "#3a3027", "stroke-width": pass ? WIDTHS[g.depth] * 0.55 : WIDTHS[g.depth],
      }, s);
    }
  }
  grain(world, 0.5, 29);
  // the door we came through, still glowing behind us
  const behind = el("div", "blob", world, { width: "360px", height: "260px", left: "180px", top: "-10px", background: "rgba(255,170,60,0.55)", filter: "blur(60px)" });
  const picks = [leaves[9], leaves[41], leaves[77]];
  const g = picks.map(([x, y]) => glint(world, x, y, 26));
  const rings = picks.map(([x, y]) =>
    el("div", null, world, {
      position: "absolute", left: `${x}px`, top: `${y}px`, width: "0", height: "0", borderRadius: "50%",
      border: `2px solid ${GOLD}`, opacity: "0", zIndex: 26,
    }),
  );
  const shade = el("div", "layer", world, { background: "#050403", zIndex: 10 });
  return (t) => {
    world.style.transform = `scale(${lerp(1.9, 1.0, ramp(t, 0.8, 6.5, ease))})`;
    behind.style.opacity = String(1 - ramp(t, 0.2, 2.5) * 0.7);
    // eyes adjusting: black, then the tunnels, faintly
    shade.style.opacity = String(1 - ramp(t, 1.6, 4.4) * 0.72);
    picks.forEach((_, i) => {
      const k = ramp(t, 4.4 + i * 0.45, 4.9 + i * 0.45, easeOut);
      g[i](t, k, i * 1.7);
      const p = ((t - 4.4 - i * 0.45) % 1.4) / 1.4;
      const size = 10 + p * 70;
      Object.assign(rings[i].style, {
        width: `${size}px`, height: `${size}px`, marginLeft: `${-size / 2}px`, marginTop: `${-size / 2}px`,
        opacity: t < 4.4 + i * 0.45 ? "0" : String((1 - p) * 0.8 * k),
      });
    });
  };
}

/*
 * The tunnel map: the derivation tree, drawn as tunnels. The door is m;
 * every fork is one step of a path, every niche at the bottom an address.
 * Three wallets' trails are in it: Centbee m/44'/0/0/{i}, RockWallet
 * m/0'/0/{i} and ElectrumSV m/44'/236'/0'/0/{i}.
 */
const MAP_H = 1580;
const NODES = {
  door: [360, 110, "m"],
  a0: [150, 380, "0'"],
  a44: [390, 380, "44'"],
  b0: [110, 650, "0"],
  b440: [300, 650, "0"],
  b236: [540, 650, "236'"],
  c4400: [300, 920, "0"],
  c2360: [560, 920, "0'"],
  d23600: [560, 1190, "0"],
};
const EDGES = [["door", "a0"], ["door", "a44"], ["a0", "b0"], ["a44", "b440"], ["a44", "b236"], ["b440", "c4400"], ["b236", "c2360"], ["c2360", "d23600"]];
// tunnels that lead off into the dark: there are far more than these
const STUBS = [["door", 640, 330], ["door", 20, 300], ["a44", 690, 600], ["a0", 250, 610], ["b236", 710, 880], ["b440", 170, 880], ["c4400", 470, 1150], ["b0", 20, 880]];
const LEAVES = {
  rock: { from: "b0", y: 920, xs: [40, 110, 180] },
  centbee: { from: "c4400", y: 1190, xs: [195, 265, 335, 405] },
  electrum: { from: "d23600", y: 1460, xs: [490, 560, 630] },
};
const TRAILS = {
  centbee: { nodes: ["door", "a44", "b440", "c4400"], leaves: "centbee" },
  rock: { nodes: ["door", "a0", "b0"], leaves: "rock" },
  electrum: { nodes: ["door", "a44", "b236", "c2360", "d23600"], leaves: "electrum" },
};
const curve = (x1, y1, x2, y2) => {
  const dy = y2 - y1;
  return `C ${x1} ${y1 + dy * 0.55} ${x2} ${y2 - dy * 0.55} ${x2} ${y2}`;
};

function tunnelMap(root, { ambient = 0.1, labels = "reached" } = {}) {
  const view = el("div", "layer", root, { background: "#0b0908", overflow: "hidden" });
  const world = el("div", null, view, { position: "absolute", left: "0", top: "0", width: `${W}px`, height: `${MAP_H}px`, transformOrigin: "0 0" });
  el("div", null, world, { position: "absolute", left: "-900px", top: "-900px", width: `${W + 1800}px`, height: `${MAP_H + 1800}px`, background: "#14110e" });
  el("div", null, world, {
    position: "absolute", left: "-900px", top: "-900px", width: `${W + 1800}px`, height: `${MAP_H + 1800}px`,
    backgroundImage: `url(${rockTexture(31)})`, backgroundSize: `${W}px ${H}px`, mixBlendMode: "overlay", opacity: "0.6",
  });
  const s = svgRoot(world, W, MAP_H);
  const defs = svg("defs", {}, s);
  const fade = svg("linearGradient", { id: "stubfade", x1: "0", y1: "0", x2: "1", y2: "1" }, defs);
  svg("stop", { offset: "0", "stop-color": "#3a3027" }, fade);
  svg("stop", { offset: "1", "stop-color": "#3a3027", "stop-opacity": "0" }, fade);
  const P = (k) => NODES[k];
  const leafEdges = [];
  for (const [name, L] of Object.entries(LEAVES)) {
    const [fx, fy] = P(L.from);
    L.xs.forEach((x, i) => leafEdges.push({ name, i, d: `M${fx} ${fy} ${curve(fx, fy, x, L.y)}` }));
  }
  const edgeD = EDGES.map(([a, b]) => `M${P(a)[0]} ${P(a)[1]} ${curve(P(a)[0], P(a)[1], P(b)[0], P(b)[1])}`);
  const stubD = STUBS.map(([a, x, y]) => `M${P(a)[0]} ${P(a)[1]} ${curve(P(a)[0], P(a)[1], x, y)}`);
  // walls, then floors: a carved passage
  for (const pass of [0, 1]) {
    for (const d of [...edgeD, ...leafEdges.map((l) => l.d)])
      svg("path", { d, fill: "none", "stroke-linecap": "round", stroke: pass ? "#0c0a08" : "#3d3228", "stroke-width": pass ? 20 : 38 }, s);
    for (const d of stubD)
      svg("path", { d, fill: "none", "stroke-linecap": "round", stroke: pass ? "#0c0a08" : "url(#stubfade)", "stroke-width": pass ? 16 : 30, opacity: pass ? 0.9 : 1 }, s);
  }
  // forks are small chambers
  for (const [k, [x, y]] of Object.entries(NODES)) {
    if (k === "door") continue;
    svg("circle", { cx: x, cy: y, r: 28, fill: "#0c0a08", stroke: "#3d3228", "stroke-width": 6 }, s);
  }
  // the door at the top: a warm arch
  const doorGlow = el("div", "blob", world, { width: "240px", height: "160px", left: "240px", top: "20px", background: "rgba(255,170,60,0.6)", filter: "blur(40px)" });
  const d0 = P("door");
  svg("path", { d: `M${d0[0] - 44} ${d0[1] + 20} L${d0[0] - 44} ${d0[1] - 20} C ${d0[0] - 44} ${d0[1] - 60} ${d0[0] + 44} ${d0[1] - 60} ${d0[0] + 44} ${d0[1] - 20} L${d0[0] + 44} ${d0[1] + 20} Z`, fill: "#FFB54A", stroke: "#5a4632", "stroke-width": 8 }, s);
  // the address niches
  const leaves = {};
  for (const [name, L] of Object.entries(LEAVES)) {
    leaves[name] = L.xs.map((x, i) => {
      const niche = el("div", null, world, {
        position: "absolute", left: `${x - 30}px`, top: `${L.y - 26}px`, width: "60px", height: "52px", borderRadius: "26px 26px 10px 10px",
        background: "#0c0a08", boxShadow: "0 0 0 6px #3d3228", zIndex: 2,
      });
      const idx = el("div", "mono", world, {
        position: "absolute", left: `${x - 40}px`, top: `${L.y + 34}px`, width: "80px", textAlign: "center", zIndex: 13,
        fontSize: "17px", fontWeight: "700", color: "rgba(255,230,190,0.55)", opacity: "0",
      });
      idx.textContent = `#${i}`;
      return { x, y: L.y, niche, idx };
    });
  }
  const light = darkness(world, { left: -900, top: -900, width: W + 1800, height: MAP_H + 1800 }, 10);
  // lit trails sit above the darkness: once lit, a trail stays lit
  const litSvg = svgRoot(world, W, MAP_H, { zIndex: 12 });
  const labelLayer = el("div", null, world, { position: "absolute", left: "0", top: "0", zIndex: 14 });
  const nodeLabels = {};
  for (const [k, [x, y, text]] of Object.entries(NODES)) {
    const e = el("div", "mono", labelLayer, {
      position: "absolute", left: `${x + (k === "door" ? 58 : 40)}px`, top: `${y - 20}px`, padding: "4px 12px", borderRadius: "999px",
      background: "rgba(20,18,16,0.9)", border: "1.5px solid rgba(255,255,255,0.14)", color: "#fff", fontSize: "22px", fontWeight: "700",
      whiteSpace: "nowrap", opacity: labels === "all" ? "0.8" : "0",
    });
    e.textContent = text;
    nodeLabels[k] = e;
  }
  /** A trail: one path through the map, lit up to fraction p, the torch at its tip. */
  function trail(name, color, { toLeaf = 0, width = 8, allLeaves = false } = {}) {
    const T = TRAILS[name];
    const pts = T.nodes.map(P);
    const L = LEAVES[T.leaves];
    let d = `M${pts[0][0]} ${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) d += " " + curve(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
    const last = pts[pts.length - 1];
    d += " " + curve(last[0], last[1], L.xs[toLeaf], L.y);
    const glow = svg("path", { d, fill: "none", stroke: color, "stroke-width": width * 3, "stroke-linecap": "round", opacity: 0.25, style: "filter: blur(6px)" }, litSvg);
    const line = svg("path", { d, fill: "none", stroke: color, "stroke-width": width, "stroke-linecap": "round", style: `filter: drop-shadow(0 0 6px ${color})` }, litSvg);
    const len = line.getTotalLength();
    for (const p of [glow, line]) {
      p.setAttribute("stroke-dasharray", `${len} ${len}`);
      p.setAttribute("stroke-dashoffset", String(len));
    }
    // the other niches of the same list, lit together at the end
    const extra = allLeaves
      ? L.xs.map((x, i) => {
          if (i === toLeaf) return null;
          const e = svg("path", { d: `M${last[0]} ${last[1]} ${curve(last[0], last[1], x, L.y)}`, fill: "none", stroke: color, "stroke-width": width, "stroke-linecap": "round", opacity: 0, style: `filter: drop-shadow(0 0 6px ${color})` }, litSvg);
          return e;
        }).filter(Boolean)
      : [];
    // where each fork falls along the trail, so its label can pop as the torch arrives
    const stops = T.nodes.map((k) => {
      const [x, y] = P(k);
      let best = 0;
      let bd = 1e9;
      for (let l = 0; l <= len; l += 4) {
        const q = line.getPointAtLength(l);
        const dd = (q.x - x) ** 2 + (q.y - y) ** 2;
        if (dd < bd) {
          bd = dd;
          best = l;
        }
      }
      return { k, at: best / len };
    });
    return {
      len, stops,
      set(p, extraK = 0) {
        const off = len * (1 - clamp(p));
        glow.setAttribute("stroke-dashoffset", String(off));
        line.setAttribute("stroke-dashoffset", String(off));
        for (const e of extra) e.setAttribute("opacity", String(extraK));
      },
      point(p) {
        const q = line.getPointAtLength(len * clamp(p));
        return { x: q.x, y: q.y };
      },
    };
  }
  const fire = torch(world, { seed: 12, z: 16 });
  return {
    view, world, light, leaves, nodeLabels, trail, fire, doorGlow,
    /** Camera: (cx, cy) of the map at the centre of the frame, at scale s. */
    camera(cx, cy, s) {
      world.style.transform = `translate(${W / 2 - cx * s}px, ${H / 2 - cy * s}px) scale(${s})`;
    },
    ambient,
  };
}

/** The derivation path so far, as the site shows it: a pill of segments, the newest in gold. */
function pathPill(parent, { top = 92 } = {}) {
  const box = el("div", null, parent, {
    position: "absolute", left: "50%", top: `${top}px`, transform: "translateX(-50%)", zIndex: 40,
    display: "flex", flexDirection: "column", alignItems: "center", gap: "10px",
  });
  const cap = el("div", "caps", box);
  cap.textContent = "Derivation path";
  const pill = el("div", "mono", box, {
    display: "flex", alignItems: "center", padding: "14px 26px", borderRadius: "20px", background: "rgba(22,20,18,0.92)",
    border: "1.5px solid rgba(255,255,255,0.12)", color: "#f4f2f0", fontSize: "38px", fontWeight: "700",
    boxShadow: "0 20px 50px rgba(0,0,0,0.5)", whiteSpace: "pre",
  });
  const segs = [];
  return {
    box,
    /** `parts` is [[text, from], …]: each shows from its time; the newest glows. */
    draw(t, parts, o = 1) {
      box.style.opacity = String(o);
      while (segs.length < parts.length) segs.push(el("span", null, pill));
      parts.forEach(([text, from], i) => {
        const sp = segs[i];
        const on = t >= from;
        sp.style.display = on ? "inline" : "none";
        if (sp.textContent !== text) sp.textContent = text;
        const next = parts[i + 1];
        const newest = on && (!next || t < next[1]);
        const pop = bump(t, from, from + 0.35);
        sp.style.color = newest ? "#FFD27A" : "#f4f2f0";
        sp.style.textShadow = newest ? "0 0 18px rgba(255,175,0,0.6)" : "none";
        sp.style.display = on ? "inline-block" : "none";
        sp.style.transform = `translateY(${-pop * 6}px)`;
      });
    },
  };
}

/** Scene 6: the torch lights the one trail from the door, fork by fork, to the first address. */
function torchPath(root) {
  const map = tunnelMap(root);
  const tr = map.trail("centbee", GOLD);
  const pill = pathPill(root);
  // when the torch reaches each fork (seconds into the scene), as the voice counts the turns
  const T = { start: 1.1, a44: 2.9, b440: 4.1, c4400: 5.3, leaf: 7.0 };
  const at = (p) => {
    // piecewise: fork by fork, easing into each
    const marks = [[T.start, 0], [T.a44, tr.stops[1].at], [T.b440, tr.stops[2].at], [T.c4400, tr.stops[3].at], [T.leaf, 1]];
    if (p <= marks[0][0]) return 0;
    for (let i = 0; i < marks.length - 1; i++) {
      const [ta, pa] = marks[i];
      const [tb, pb] = marks[i + 1];
      if (p <= tb) return lerp(pa, pb, ease(clamp((p - ta) / (tb - ta))));
    }
    return 1;
  };
  const coins = coinPile(map.world, LEAVES.centbee.xs[0], LEAVES.centbee.y + 4, 0.55, 15);
  const g = glint(map.world, LEAVES.centbee.xs[0] + 14, LEAVES.centbee.y - 18, 26, 17);
  const cam = [
    [0, { x: 360, y: 300, s: 1.35 }],
    [1.0, { x: 360, y: 260, s: 1.3 }],
    [T.a44, { x: 380, y: 480, s: 1.2 }],
    [T.b440, { x: 330, y: 720, s: 1.15 }],
    [T.c4400, { x: 310, y: 960, s: 1.12 }],
    [T.leaf, { x: 290, y: 1120, s: 1.1 }],
    [9.2, { x: 330, y: 760, s: 0.74 }],
  ];
  return (t) => {
    const c = kf(cam, t, { x: 0, y: 0, s: 1 });
    map.camera(c.x, c.y, c.s);
    const p = at(t);
    tr.set(p);
    const q = tr.point(p);
    const lit = ramp(t, 0.3, 1.1, easeOut);
    map.fire.draw(t, q.x + 16, q.y + 28, 0.62, lit);
    const f = flicker(t, 12);
    map.light([{ x: q.x, y: q.y - 20, r: 330 * f * lit + 1, k: 0.95 * lit }, { x: 360, y: 90, r: 260, k: 0.6 }], lerp(0.05, 0.16, ramp(t, 7, 9)));
    for (const s of tr.stops) map.nodeLabels[s.k].style.opacity = String(ramp(p, s.at - 0.02, s.at + 0.03));
    const leafOn = ramp(t, T.leaf - 0.2, T.leaf + 0.4, easeOut);
    map.leaves.centbee[0].idx.style.opacity = String(leafOn);
    coins.style.opacity = String(leafOn);
    g(t, leafOn);
    pill.draw(t, [["m", 0.9], ["/44'", T.a44 - 0.1], ["/0", T.b440 - 0.1], ["/0", T.c4400 - 0.1], ["/0", T.leaf - 0.2]], ramp(t, 0.6, 1.1));
  };
}

/** Scene 7: along the address list, chamber by chamber: coins and history in each. */
function chambers(root) {
  const view = el("div", "layer", root, { background: "#0b0908" });
  const world = el("div", null, view, { position: "absolute", left: "0", top: "0", width: "1900px", height: `${H}px` });
  el("div", null, world, { position: "absolute", inset: "0", background: "linear-gradient(#1c1712, #14110e 40%, #100d0b)" });
  el("div", null, world, {
    position: "absolute", inset: "0", backgroundImage: `url(${rockTexture(41)})`, backgroundSize: `${W}px ${H}px`, mixBlendMode: "overlay", opacity: "0.75",
  });
  // the passage: a floor running along, the chambers cut into its back wall
  el("div", null, world, { position: "absolute", left: "0", right: "0", top: "930px", height: "60px", background: "linear-gradient(#2a221b, #0e0b09)" });
  const XS = [330, 730, 1130, 1530];
  const rooms = DEMO.chambers.slice(0, 4).map((c, i) => {
    const x = XS[i];
    const arch = el("div", null, world, {
      position: "absolute", left: `${x - 170}px`, top: "380px", width: "340px", height: "560px", borderRadius: "170px 170px 16px 16px",
      background: "radial-gradient(90% 70% at 50% 70%, #0a0807, #050403)", boxShadow: "0 0 0 12px #3a2f25, inset 0 20px 60px rgba(0,0,0,0.8)",
    });
    const coins = c.sats ? coinPile(world, x, 872, 1.15, 5) : null;
    const card = el("div", "card", world, { left: `${x - 150}px`, top: "560px", width: "300px", padding: "20px 22px", zIndex: 14, opacity: "0" });
    const head = el("div", null, card, { display: "flex", alignItems: "center", justifyContent: "space-between" });
    el("div", "caps", head).textContent = "Address";
    el("div", "mono", head, { fontSize: "18px", fontWeight: "700", color: "#FFD27A" }).textContent = `#${c.index}`;
    el("div", "mono", card, { fontSize: "19px", marginTop: "6px", color: "rgba(244,242,240,0.8)" }).textContent = short(c.address);
    const amt = el("div", null, card, { marginTop: "12px", fontSize: "30px", fontWeight: "800", letterSpacing: "-0.02em", color: c.sats ? "#fff" : "rgba(244,242,240,0.45)" });
    amt.innerHTML = `${fmtSats(c.sats)} <span style="font-size:17px;font-weight:700;color:rgba(244,242,240,0.55);letter-spacing:0">sats</span>`;
    const hist = el("div", null, card, { marginTop: "6px", fontSize: "17px", fontWeight: "700", color: "rgba(244,242,240,0.6)" });
    hist.textContent = c.sats ? `${c.txs} transaction${c.txs === 1 ? "" : "s"}` : `Used before, now empty · ${c.txs} transactions`;
    return { x, arch, coins, card, g: c.sats ? glint(world, x + 40, 836, 24, 16) : null };
  });
  const light = darkness(world, { left: -400, top: -400, width: 2700, height: H + 800 }, 10);
  const fire = torch(world, { seed: 15, z: 16 });
  const pill = pathPill(root, { top: 150 });
  const air = dust(world, 50, 17, { x: 0, y: 300, w: 1900, h: 700 });
  // the torch walks along: its x over time, pausing at each chamber
  const walk = [[0, 60], [0.9, 250], [2.4, 650], [3.9, 1050], [5.4, 1450], [8, 1560]];
  const reach = [0.95, 2.45, 3.95, 5.45];
  return (t) => {
    const x = kf(walk.map(([tt, v]) => [tt, { x: v }]), t, { x: 0 }).x;
    const camX = clamp(x, W / 2, 1900 - W / 2);
    world.style.transform = `translateX(${W / 2 - camX}px)`;
    const f = flicker(t, 15);
    fire.draw(t, x, 880 + Math.sin(t * 5) * 4, 0.85, 1);
    light([{ x, y: 760, r: 420 * f, k: 0.95 }], 0.08);
    rooms.forEach((r, i) => {
      const on = ramp(t, reach[i] - 0.25, reach[i] + 0.35, easeOut);
      r.card.style.opacity = String(on);
      r.card.style.transform = `translateY(${(1 - on) * 30}px)`;
      if (r.coins) r.coins.style.opacity = String(on);
      if (r.g) r.g(t, on, i);
    });
    const idx = reach.reduce((a, rt, i) => (t >= rt - 0.3 ? i : a), 0);
    pill.draw(t, [["m/44'/0/0/", -1], [String(idx), reach[idx] - 0.3]]);
    air(t, 0.7);
  };
}

/** Scene 9: three wallets, three trails. The wrong one ends in empty chambers; your coins sit on another. */
function wrongTrail(root) {
  const map = tunnelMap(root, { labels: "all" });
  const trails = {
    rock: { tr: map.trail("rock", "#C9D4E6", { allLeaves: true }), from: 0.4, to: 2.6, name: "RockWallet", icon: "rock.png", tpl: "m/0'/0/{i}", at: [150, 380], dx: -120, dy: -96, color: "#C9D4E6" },
    centbee: { tr: map.trail("centbee", GOLD, { allLeaves: true }), from: 0.8, to: 3.2, name: "Centbee", icon: "centbee.png", tpl: "m/44'/0/0/{i}", at: [300, 650], dx: -270, dy: 40, color: GOLD },
    electrum: { tr: map.trail("electrum", "#FF6B3D", { allLeaves: true }), from: 1.2, to: 3.6, name: "ElectrumSV", icon: "electrumsv.png", tpl: "m/44'/236'/0'/0/{i}", at: [540, 650], dx: -250, dy: 70, color: "#FF6B3D" },
  };
  // a legend at the top of the frame, one pill per trail in its colour
  Object.values(trails).forEach((w, i) => {
    w.pill = el("div", "pill", root, { left: "30px", top: `${70 + i * 76}px`, zIndex: 40, opacity: "0", fontSize: "24px", borderColor: w.color });
    const img = el("img", null, w.pill);
    img.src = WALLET_ICON(w.icon);
    el("span", null, w.pill).textContent = w.name;
    el("span", "mono", w.pill, { fontSize: "19px", color: w.color, fontWeight: "600" }).textContent = w.tpl;
  });
  // empty: a zero under each of ElectrumSV's niches, then a verdict
  const zeros = map.leaves.electrum.map((l) => {
    const z = el("div", "mono", map.world, {
      position: "absolute", left: `${l.x - 50}px`, top: `${l.y + 62}px`, width: "100px", textAlign: "center", zIndex: 15,
      fontSize: "22px", fontWeight: "700", color: "rgba(255,255,255,0.5)", opacity: "0",
    });
    z.textContent = "0";
    return z;
  });
  const empty = el("div", "pill", map.world, { left: "418px", top: "1580px", zIndex: 15, opacity: "0", fontSize: "26px", color: "rgba(255,255,255,0.8)" });
  empty.textContent = "Looks empty";
  const coins = LEAVES.centbee.xs.map((x, i) => (DEMO.chambers[i].sats ? coinPile(map.world, x, LEAVES.centbee.y + 4, 0.55, 15) : null));
  const glints = LEAVES.centbee.xs.map((x, i) => (DEMO.chambers[i].sats ? glint(map.world, x + 14, LEAVES.centbee.y - 18, 24, 17) : null));
  const total = DEMO.chambers.reduce((s, c) => s + c.sats, 0);
  const found = el("div", "pill", map.world, { left: "120px", top: "1290px", zIndex: 15, opacity: "0", fontSize: "28px", borderColor: GOLD });
  found.innerHTML = `<span style="color:#FFD27A">${fmtSats(total)}</span><span style="font-size:20px;color:rgba(255,255,255,0.6)">sats, right here</span>`;
  const cam = [
    [0, { x: 360, y: 760, s: 0.8 }],
    [3.8, { x: 370, y: 790, s: 0.8 }],
    [5.9, { x: 540, y: 1330, s: 1.08 }],
    [9.6, { x: 530, y: 1340, s: 1.1 }],
    [11.2, { x: 330, y: 1150, s: 0.98 }],
    [13, { x: 330, y: 1140, s: 1.0 }],
  ];
  return (t) => {
    const c = kf(cam, t, { x: 0, y: 0, s: 1 });
    map.camera(c.x, c.y, c.s);
    const lights = [{ x: 360, y: 90, r: 280, k: 0.6 }];
    for (const w of Object.values(trails)) {
      const p = ramp(t, w.from, w.to, ease);
      w.tr.set(p, ramp(t, w.to, w.to + 0.5));
      w.pill.style.opacity = String(ramp(t, w.from + 0.3, w.from + 0.7, easeOut));
    }
    const eOn = ramp(t, 5.4, 6.2, easeOut);
    const tip = trails.electrum.tr.point(1);
    lights.push({ x: tip.x, y: tip.y, r: 360 * flicker(t, 3) * eOn + 1, k: 0.85 * eOn });
    zeros.forEach((z, i) => (z.style.opacity = String(ramp(t, 6.0 + i * 0.2, 6.4 + i * 0.2))));
    empty.style.opacity = String(ramp(t, 7.0, 7.5, easeOut) * (1 - ramp(t, 10.2, 10.6)));
    const cOn = ramp(t, 10.3, 11.0, easeOut);
    lights.push({ x: 300, y: 1190, r: 420 * flicker(t, 5) * cOn + 1, k: 0.95 * cOn });
    coins.forEach((cp) => cp && (cp.style.opacity = String(cOn)));
    glints.forEach((g, i) => g && g(t, cOn, i));
    found.style.opacity = String(ramp(t, 11.0, 11.5, easeOut));
    map.leaves.centbee.forEach((l) => (l.idx.style.opacity = String(cOn)));
    map.leaves.electrum.forEach((l) => (l.idx.style.opacity = String(eOn)));
    map.fire.root.style.display = "none";
    map.light(lights, 0.2);
  };
}

/** Scene 14: all of it inside your browser: the phrase and the torch stay on this device. */
function inBrowser(root, start) {
  const bg = studio(root);
  const win = el("div", "card", root, { left: "70px", top: "250px", width: "580px", height: "720px", overflow: "hidden", background: "#141210" });
  const bar = el("div", null, win, { height: "64px", display: "flex", alignItems: "center", gap: "10px", padding: "0 22px", background: "#1f1c19", borderBottom: "1.5px solid rgba(255,255,255,0.06)" });
  ["#ff5f57", "#febc2e", "#28c840"].forEach((c) => el("div", null, bar, { width: "14px", height: "14px", borderRadius: "50%", background: c, opacity: "0.8" }));
  const url = el("div", null, bar, {
    marginLeft: "16px", flex: "1", height: "38px", borderRadius: "999px", background: "rgba(255,255,255,0.07)", display: "flex", alignItems: "center",
    gap: "8px", padding: "0 16px", color: "rgba(255,255,255,0.75)", fontSize: "18px", fontWeight: "700",
  });
  url.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Derivation Path`;
  const inside = el("div", null, win, { position: "absolute", left: "0", right: "0", top: "64px", bottom: "0", overflow: "hidden" });
  el("div", "layer", inside, { background: "radial-gradient(70% 60% at 50% 42%, #2a1e12, #110e0b 70%)" });
  grain(inside, 0.5, 51);
  const fire = torch(inside, { seed: 21 });
  const grid = el("div", null, inside, { position: "absolute", left: "40px", right: "40px", top: "400px", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" });
  const chips = DEMO.phrase.split(" ").map((w, i) => {
    const c = el("div", null, grid, {
      height: "46px", borderRadius: "12px", background: "rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: "8px", padding: "0 12px",
      color: "#f4f2f0", fontSize: "19px", fontWeight: "700", filter: "blur(6px)", opacity: "0",
    });
    c.innerHTML = `<span style="font-size:13px;opacity:.45">${i + 1}</span>${w}`;
    return c;
  });
  const badge = el("div", "pill", root, { left: "50%", top: "930px", zIndex: 30, opacity: "0", fontSize: "24px", transform: "translateX(-50%)", borderColor: "rgba(255,175,0,0.55)" });
  badge.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFD27A" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg> Stays on this device`;
  // the edge of the device: a dashed line the phrase never crosses
  const edge = el("div", null, root, { position: "absolute", left: "44px", top: "224px", width: "632px", height: "772px", borderRadius: "40px", border: "2.5px dashed rgba(255,175,0,0.5)", opacity: "0" });
  const foot = el("div", null, root, { position: "absolute", left: "0", right: "0", top: "1030px", textAlign: "center", color: "rgba(244,242,240,0.6)", fontSize: "22px", fontWeight: "700", opacity: "0" });
  foot.textContent = "Open source · No account · Your keys stay on this page";
  return (t) => {
    bg(start + t);
    const inn = ramp(t, 0, 0.6, easeOut);
    win.style.opacity = String(inn);
    win.style.transform = `translateY(${(1 - inn) * 40}px) scale(${0.96 + inn * 0.04})`;
    fire.draw(t, 290, 300, 1.1, ramp(t, 0.3, 1, easeOut));
    chips.forEach((c, i) => (c.style.opacity = String(ramp(t, 0.8 + i * 0.06, 1.2 + i * 0.06))));
    edge.style.opacity = String(ramp(t, 2.8, 3.4) * (0.7 + 0.3 * Math.sin(t * 3)));
    badge.style.opacity = String(ramp(t, 3.2, 3.7, easeOut));
    badge.style.transform = `translateX(-50%) scale(${1 + 0.08 * bump(t, 3.2, 3.7)})`;
    foot.style.opacity = String(ramp(t, 4.2, 4.8));
  };
}

// --------------------------------------------------------------- phones

// the phone and its screen, in stage pixels
const PHONE_W = 370;
const PHONE_H = 802;
const SCREEN_W = 346;
const SCREEN_H = 778;

function mark(shot, key, fallback) {
  return (MARKS[shot] && MARKS[shot][key]) || fallback || { u: 0.5, v: 0.5 };
}

/** The frames of a burst capture.py filmed, as screens from time t0: [[t, shot, 0], …]. */
function burst(name, t0) {
  const n = BURSTS[name] || 1;
  return Array.from({ length: n }, (_, i) => [t0 + i / BURST_FPS, `${name}_${String(i).padStart(2, "0")}`, 0]);
}
/** A burst's last frame (where its marks are). */
const last = (name) => `${name}_${String((BURSTS[name] || 1) - 1).padStart(2, "0")}`;

/**
 * How far the camera may move along one axis at scale s: the phone either
 * sits wholly in frame or its screen fills the frame, never a sliver of edge.
 */
function limit(offset, s, frame, phone, screen) {
  if (screen * s >= frame) return clamp(offset, -(screen * s - frame) / 2, (screen * s - frame) / 2);
  if (phone * s <= frame) return clamp(offset, -(frame - phone * s) / 2 + 24, (frame - phone * s) / 2 - 24);
  return 0;
}

/** Camera values that bring a point of the screen (u, v) to the middle, at scale s. */
function focusUV(u, v, s, extra = {}) {
  return {
    x: limit(-(u - 0.5) * SCREEN_W * s, s, W, PHONE_W, SCREEN_W),
    y: limit(-(v - 0.5) * SCREEN_H * s, s, H, PHONE_H, SCREEN_H),
    s, rx: 0, ry: 0, rz: 0, z: 0, ...extra,
  };
}
const focus = (shot, key, s, dv = 0, extra) => {
  const m = mark(shot, key);
  return focusUV(m.u, m.v + dv, s, extra);
};
/** The whole phone, flat and centred, as large as the frame allows. */
const WHOLE = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, s: 1.22 };

/**
 * A phone playing a sequence of screens: `screens` is [[time, shot, fade?], …].
 * Each change cross-fades (0.12 s unless given; bursts cut straight).
 */
function makePhone(parent, screens) {
  const root = el("div", "phone", parent);
  for (let i = 1; i <= 9; i++) el("div", "edge", root, { transform: `translateZ(${-i * 1.3}px)` });
  const body = el("div", "body", root);
  const screen = el("div", "screen", body);
  const imgs = screens.map(([time, shot, fade = 0.12]) => {
    const img = el("img", null, screen, { opacity: "0" });
    img.src = `captures/${shot}.png`;
    return { time, shot, fade, img };
  });
  const overlay = el("div", null, screen, { position: "absolute", inset: "0", overflow: "hidden", zIndex: 3 });
  el("div", "shine", root);
  return { root, imgs, overlay };
}

function placePhone(p, v, t) {
  p.root.style.transform =
    `translate3d(${v.x}px, ${v.y}px, ${v.z}px) rotateX(${v.rx}deg) rotateY(${v.ry}deg) ` +
    `rotateZ(${v.rz}deg) scale(${v.s})`;
  p.root.style.opacity = v.o;
  p.root.style.filter = v.blur > 0.05 ? `blur(${v.blur}px)` : "none";
  let cur = 0;
  p.imgs.forEach((i, n) => {
    if (t >= i.time) cur = n;
  });
  const now = p.imgs[cur];
  const fading = cur > 0 && now.fade > 0 && t < now.time + now.fade;
  p.imgs.forEach((i, n) => {
    if (n === cur) i.img.style.opacity = fading ? ramp(t, i.time, i.time + i.fade, linear) : 1;
    else i.img.style.opacity = fading && n === cur - 1 ? 1 : 0;
    i.img.style.zIndex = n === cur ? 2 : 1;
  });
  const img = now.img;
  if (img.naturalHeight) {
    const shown = (SCREEN_W * img.naturalHeight) / img.naturalWidth;
    img.style.transform = `translateY(${-Math.max(0, shown - SCREEN_H) * v.scroll}px)`;
  }
}

/** A fingertip: it comes down on a mark, presses, and leaves a ripple. `taps` is [[time, shot, mark], …]. */
function fingertips(phone, taps) {
  const made = taps.map(([time, shot, key]) => {
    const m = mark(shot, key);
    const dot = el("div", null, phone.overlay, {
      position: "absolute", left: `${m.u * 100}%`, top: `${m.v * 100}%`, width: "46px", height: "46px",
      margin: "-23px 0 0 -23px", borderRadius: "50%", background: "rgba(255,255,255,0.42)",
      border: "2px solid rgba(255,255,255,0.9)", boxShadow: "0 4px 18px rgba(0,0,0,0.28)", opacity: "0", zIndex: 5,
    });
    const ripple = el("div", null, phone.overlay, {
      position: "absolute", left: `${m.u * 100}%`, top: `${m.v * 100}%`, borderRadius: "50%",
      border: "2px solid rgba(255,175,0,0.9)", opacity: "0", zIndex: 5,
    });
    return { time, dot, ripple };
  });
  return (t) => {
    for (const f of made) {
      const lt = t - f.time;
      const show = ramp(lt, -0.35, -0.15, easeOut) * (1 - ramp(lt, 0.25, 0.45));
      const press = lt >= 0 && lt < 0.14 ? 0.8 : 1;
      f.dot.style.opacity = show;
      f.dot.style.transform = `scale(${(1.25 - 0.25 * ramp(lt, -0.35, -0.15)) * press})`;
      const r = ramp(lt, 0, 0.5, easeOut);
      const size = 30 + r * 90;
      Object.assign(f.ripple.style, {
        width: `${size}px`, height: `${size}px`, marginLeft: `${-size / 2}px`, marginTop: `${-size / 2}px`,
        opacity: lt >= 0 && lt < 0.5 ? `${1 - r}` : "0",
      });
    }
  };
}

/** Between close-ups the camera leans toward what's about to be tapped. */
function lean(v, taps, t) {
  if (!taps || v.s > 1.4) return v;
  let best = null;
  let w = 0;
  for (const [time, shot, key] of taps) {
    const k = bump(t, time - 0.75, time + 0.45);
    if (k > w) {
      w = k;
      best = mark(shot, key);
    }
  }
  if (!best) return v;
  const s = v.s * (1 + 0.07 * w);
  const target = focusUV(best.u, best.v, s);
  return { ...v, s, x: v.x + (target.x - v.x) * 0.35 * w, y: v.y + (target.y - v.y) * 0.35 * w };
}

/** Phones in the torch-lit studio. Each phone: {screens, cam, taps}. `extra(root)` may add more. */
const ui = (label, dur, phones, extra) => ({
  label,
  kind: "ui",
  dur,
  build(root, start) {
    const bg = studio(root);
    const layer = el("div", "layer", root, { perspective: "1700px" });
    const made = phones.map((p) => {
      const ph = makePhone(layer, p.screens);
      return { ...p, ph, tips: p.taps ? fingertips(ph, p.taps) : null };
    });
    const add = extra ? extra(root) : null;
    return (t) => {
      bg(start + t);
      const inn = ramp(t, 0, 0.35, easeOut);
      layer.style.filter = inn < 1 ? `blur(${(1 - inn) * 10}px)` : "none";
      layer.style.transform = `scale(${1.05 - inn * 0.05})`;
      for (const m of made) {
        placePhone(m.ph, lean(kf(m.cam, t), m.taps, t), t);
        if (m.tips) m.tips(t);
      }
      if (add) add(t);
    };
  },
});

/**
 * Wallet names as pills beside the phone, each popping out as the voice
 * names it. `items` is [[time, icon, text], …].
 */
function walletPills(root, items, { x = 40, y = 330, gap = 96 } = {}) {
  const made = items.map(([time, icon, text], i) => {
    const p = el("div", "pill", root, { left: `${x}px`, top: `${y + i * gap}px`, zIndex: 20, opacity: "0", fontSize: "26px", transformOrigin: "left center" });
    if (icon) {
      const img = el("img", null, p, { width: "38px", height: "38px", borderRadius: "10px" });
      img.src = WALLET_ICON(icon);
    }
    el("span", null, p).textContent = text;
    return { p, time };
  });
  return (t, out = 1) => {
    for (const m of made) {
      const k = ramp(t, m.time, m.time + 0.35, easeOut);
      m.p.style.opacity = String(k * out);
      m.p.style.transform = `translateX(${(1 - k) * -50 - (1 - out) * 80}px) scale(${0.85 + 0.15 * k + 0.06 * bump(t, m.time, m.time + 0.45)})`;
      m.p.style.filter = k < 1 ? `blur(${(1 - k) * 8}px)` : "none";
    }
  };
}

const FRONT_START = { x: -120, y: 30, ry: -24, rz: 4, s: 0.9 };

// ------------------------------------------------------------------ scenes

const SCENES = [
  cave("Cold open: the cave at night", 6.8, coldOpen),
  title("Your coins\naren't *lost*", "gold"),
  title("Introducing\nDerivation *Path*", "horizon", 3.4),
  cave("The door: your seed phrase", 9.2, door),
  cave("Inside: thousands of dark tunnels", 8.9, tunnels),
  cave("The torch: your derivation path", 11.4, torchPath),
  cave("The chambers: your addresses", 8.0, chambers),
  title("Every wallet lit\nits *own* trail", "gray", 2.2),
  cave("Wrong trail, empty cave", 13.0, wrongTrail),
  title("We know\nthe *trails*", "ember", 1.8),

  ui(
    "App: pick your wallet, enter your phrase",
    10.2,
    [
      {
        screens: [
          [0, "wallet_0"], [2.6, "wallet_picker"], [4.4, "wallet_1"],
          [5.5, "wallet_phrase_0", 0], [6.0, "wallet_phrase_1", 0], [6.5, "wallet_phrase_2", 0], [7.0, "wallet_phrase_3", 0],
          [7.6, "wallet_2"], [8.9, "wallet_loaded"],
        ],
        cam: [
          [0, { ...FRONT_START, x: 150, ry: -18 }],
          [1.0, { x: 150, y: 0, ry: -14, rz: 2, s: 1.0 }],
          [2.2, { x: 150, y: 0, ry: -12, rz: 2, s: 1.0 }],
          [3.0, focus("wallet_picker", "list", 1.55)],
          [4.2, focus("wallet_picker", "list", 1.55)],
          [5.0, focus("wallet_1", "phrase", 1.7)],
          [7.2, focus("wallet_phrase_3", "phrase", 1.7)],
          [8.0, WHOLE],
          [9.3, focus("wallet_loaded", "address", 1.45)],
        ],
        taps: [[2.3, "wallet_0", "preset"], [4.1, "wallet_picker", "centbee"], [5.2, "wallet_1", "phrase"], [8.5, "wallet_2", "load"]],
      },
    ],
    (root) => {
      const pills = walletPills(root, [[0.5, "centbee.png", "Centbee"], [1.1, "rock.png", "RockWallet"], [1.7, "electrumsv.png", "ElectrumSV"], [2.3, null, "and more"]], { x: 30, y: 380 });
      return (t) => pills(t, 1 - ramp(t, 2.7, 3.2));
    },
  ),
  ui("App: scan every trail", 11.2, [
    {
      screens: [
        [0, "recover_0"], [1.5, "recover_scope"], [2.9, "recover_1"], [3.6, "recover_2"],
        ...burst("scan", 4.3), [7.2, "recover_done"],
      ],
      cam: [
        [0, { ...FRONT_START }],
        [0.9, WHOLE],
        [1.8, focus("recover_scope", "all", 1.6)],
        [2.8, focus("recover_scope", "all", 1.6)],
        [3.6, WHOLE],
        [4.6, focus(last("scan"), "scan", 1.3, 0.12)],
        [6.8, focus(last("scan"), "scan", 1.3, 0.12)],
        [7.6, focus("recover_done", "table", 1.35)],
        [10.2, focus("recover_done", "total", 1.5)],
      ],
      taps: [[1.2, "recover_0", "scope"], [2.6, "recover_scope", "all"], [4.1, "recover_2", "scan"]],
    },
  ]),
  ui("App: move your coins", 9.4, [
    {
      screens: [[0, "move_0"], [2.6, "move_1"], [4.3, "move_2"], [5.9, "move_confirm"], [7.2, "move_done"]],
      cam: [
        [0, focus("move_0", "total", 1.5)],
        [1.4, focus("move_0", "brc100", 1.5)],
        [2.4, WHOLE],
        [3.2, focus("move_1", "dest", 1.45)],
        [4.2, WHOLE],
        [5.0, focus("move_2", "ready", 1.45)],
        [5.9, WHOLE],
        [7.4, focus("move_done", "sent", 1.4)],
      ],
      taps: [[2.3, "move_0", "address"], [4.0, "move_1", "prepare"], [5.6, "move_2", "send"], [6.9, "move_confirm", "confirm"]],
    },
  ]),

  cave("In your browser only", 6.4, inBrowser),

  // the close: the brand, the promise, the way in
  {
    label: "Close: Derivation Path, start recovering",
    kind: "title",
    dur: 7.2,
    build(root, start) {
      const bg = horizon(root);
      const box = el("div", null, root, { position: "absolute", left: "0", right: "0", top: "420px", display: "flex", flexDirection: "column", alignItems: "center", gap: "30px" });
      const mark = el("div", null, box, { width: "120px", height: "120px", filter: "drop-shadow(0 18px 50px rgba(255,160,0,0.45))" });
      mark.innerHTML = LOGO;
      const word = brand(box, 58);
      word.firstChild.remove();
      const tag = el("div", null, box, { color: "rgba(255,255,255,0.8)", fontSize: "34px", fontWeight: "700", letterSpacing: "-0.01em", textAlign: "center" });
      tag.textContent = "Find your way back to your coins.";
      const cta = el("div", null, box, {
        marginTop: "18px", height: "76px", padding: "0 38px", borderRadius: "999px", background: GOLD, color: "#2d2d31",
        display: "flex", alignItems: "center", gap: "12px", fontSize: "30px", fontWeight: "800", boxShadow: "0 18px 50px rgba(255,160,0,0.35)",
      });
      cta.innerHTML = `<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg> Start recovering`;
      const foot = el("div", null, box, { color: "rgba(255,255,255,0.5)", fontSize: "21px", fontWeight: "600" });
      foot.textContent = "Free · Open source · Runs in your browser";
      const parts = [[mark, 0], [word, 0.3], [tag, 1.0], [cta, 2.2], [foot, 2.8]];
      const fade = el("div", "layer", root, { background: "#000", opacity: "0" });
      return (t) => {
        bg(start + t);
        for (const [e, at] of parts) {
          const p = ramp(t, at, at + 0.6, easeOut);
          e.style.opacity = String(p);
          e.style.filter = p < 1 ? `blur(${(1 - p) * 10}px)` : "none";
          e.style.transform = `translateY(${(1 - p) * 16}px) scale(${e === cta ? 1 + 0.05 * bump(t, 2.5, 3.1) : 1})`;
        }
        fade.style.opacity = String(ramp(t, 5.8, 7.2, linear));
      };
    },
  },
];

// ----------------------------------------------------------------- runtime

/**
 * The music's beat: once a track is in (video/music.json), set this to
 * { bpm, at: drop.video } and every cut lands on a beat (each scene's
 * length is then a guide; its end moves to the nearest beat). Until then
 * scenes run exactly as long as SCENES says.
 */
const BEAT_GRID = null;
const onBeat = (t, round = Math.round) => {
  if (!BEAT_GRID) return Math.round(t * 1000) / 1000;
  const beat = 60 / BEAT_GRID.bpm;
  return Math.round((BEAT_GRID.at + round((t - BEAT_GRID.at) / beat) * beat) * 1000) / 1000;
};

let at = 0;
let cut = 0;
const built = SCENES.map((scene, i) => {
  const start = cut;
  at += scene.dur;
  cut = onBeat(at, i === SCENES.length - 1 ? Math.ceil : Math.round);
  const root = el("div", "layer", stage, { display: "none" });
  return { label: scene.label, kind: scene.kind === "title" ? "title" : "ui", start, end: cut, root, draw: scene.build(root, start) };
});
const DURATION = cut;

/** A soft band of torchlight sweeping across each cut, tying the cave and the app together. */
const sweep = el("div", null, stage, {
  position: "absolute", top: "-600px", width: "320px", height: "2600px", left: "0", zIndex: 50, pointerEvents: "none",
  background: "linear-gradient(90deg, transparent, rgba(255,150,0,0.28) 35%, rgba(255,226,160,0.55) 50%, rgba(255,150,0,0.28) 65%, transparent)",
  filter: "blur(22px)", mixBlendMode: "screen", opacity: "0",
});
const CUTS = built.slice(1, -1).map((b) => b.start);

function drawSweep(t) {
  let k = 0;
  let p = 0;
  for (const c of CUTS) {
    const w = bump(t, c - 0.22, c + 0.22);
    if (w > k) {
      k = w;
      p = (t - (c - 0.22)) / 0.44;
    }
  }
  sweep.style.opacity = k * 0.9;
  sweep.style.transform = `translateX(${lerp(-420, 820, p)}px) rotate(18deg)`;
}

/**
 * Subtitles, baked in, for the captioned copy (render.py turns them on with
 * CAPTIONS_ON). They mirror the site's live subtitles
 * (src/components/ExplainerSubtitles.tsx): the sentence being spoken on dark
 * bars, two lines at most, the second joining when the voice reaches it, and
 * the word being spoken in white with black text. Hidden during title cards.
 * Data: captions.js, made by subtitles.py from voiceover.json.
 */
const CAPTIONS = window.CAPTIONS || null;
window.CAPTIONS_ON = false;
const capBox = el("div", "captions", stage);
let capKey = "";

function drawCaptions(t) {
  const hidden = !window.CAPTIONS_ON || !CAPTIONS || CAPTIONS.hide.some(([a, b]) => t >= a && t < b);
  const page = hidden ? null : CAPTIONS.pages.find((p) => t >= p.start && t < p.end);
  const key = page ? `${page.start}` : "";
  if (key !== capKey) {
    capKey = key;
    capBox.innerHTML = "";
    if (page) {
      const words = page.lines.flat();
      for (const line of page.lines) {
        const row = el("div", "cap-line", capBox);
        row.dataset.t = line[0].t;
        line.forEach((w, i) => {
          if (i) row.append(" ");
          const word = el("span", "cap-word", row);
          word.textContent = w.w;
          // lit from its start until the next word begins
          const next = words[words.indexOf(w) + 1];
          word.dataset.t = w.t;
          word.dataset.e = next ? next.t : w.e + 0.15;
        });
      }
    }
  }
  for (const row of capBox.querySelectorAll(".cap-line")) {
    const p = ramp(t, +row.dataset.t - 0.05, +row.dataset.t + 0.15, easeOut);
    row.style.opacity = p;
    row.style.transform = `translateY(${(1 - p) * 0.15}em)`;
  }
  for (const word of capBox.querySelectorAll(".cap-word"))
    word.classList.toggle("on", t >= +word.dataset.t && t < +word.dataset.e);
}

let shown = null;
window.seek = (t) => {
  const s = built.find((b) => t >= b.start && t < b.end) || built[built.length - 1];
  if (shown !== s) {
    if (shown) shown.root.style.display = "none";
    s.root.style.display = "block";
    shown = s;
  }
  s.draw(t - s.start);
  drawSweep(t);
  drawCaptions(t);
};
window.DURATION = DURATION;
window.BEAT_GRID = BEAT_GRID;
/** Every scene, for `render.py --timings` and `--check`; titles pause the subtitles. */
window.SCENE_LIST = built.map(({ label, kind, start, end }) => ({ label, kind, start, end }));
/** The poster: the torch-lit trail, the path spelled out above it. */
window.POSTER_AT = built[5].start + 7.6;

// ready once every picture and the font have loaded; lists what's missing
window.READY = Promise.all([
  document.fonts.load('700 20px "Nunito Variable"'),
  document.fonts.ready,
  ...[...document.images].map((img) =>
    img.complete ? Promise.resolve() : new Promise((r) => { img.onload = r; img.onerror = r; }),
  ),
]).then(() => {
  window.MISSING = [...new Set([...document.images].filter((i) => !i.naturalWidth).map((i) => i.getAttribute("src")))];
  return true;
});

// in a browser (not rendering): play it, space to pause, arrows to step
if (!new URLSearchParams(location.search).has("render")) {
  let t = 0;
  let playing = true;
  let lastNow = performance.now();
  const clock = el("div", null, document.body, {
    position: "fixed", left: "12px", top: "10px", color: "#999", font: "13px ui-monospace, monospace",
  });
  addEventListener("keydown", (e) => {
    if (e.key === " ") playing = !playing;
    if (e.key === "ArrowRight") t = Math.min(DURATION, t + 1);
    if (e.key === "ArrowLeft") t = Math.max(0, t - 1);
  });
  const tick = (now) => {
    if (playing) t = (t + (now - lastNow) / 1000) % DURATION;
    lastNow = now;
    window.seek(t);
    const s = built.find((b) => t >= b.start && t < b.end);
    clock.textContent = `${t.toFixed(2)}s · ${s ? s.label : ""}`;
    requestAnimationFrame(tick);
  };
  window.READY.then(() => requestAnimationFrame(tick));
}
