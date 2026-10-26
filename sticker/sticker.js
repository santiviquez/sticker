// sticker: die-cut stickers for your website that peel, get carried around on
// the cursor, wear out, and end up in the trash.
//
//   import { createBoard } from "./sticker/sticker.js";
//   const board = createBoard();
//   board.add({ src: "/me.webp", eyes: { left: { x: 0.4, y: 0.36 }, right: { x: 0.59, y: 0.36 } } });

import { buildArt, loadImage } from "./art.js";
import { dirtyBack } from "./dust.js";
import { buildEyes, Googly, blink, pupilTravel } from "./eyes.js";
import { EASE_OUT, springEasing, clipBox, creaseRuns, fold, reflection, rotate } from "./motion.js";
import { buildTrashCan, canMouth, playCatch, Z } from "./trash.js";
import { CSS } from "./styles.js";

const DEG = Math.PI / 180;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

// Lets the browser get a frame in between stickers without waiting around.
function yieldToBrowser() {
  if (globalThis.scheduler?.yield) return globalThis.scheduler.yield();
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => resolve();
    channel.port2.postMessage(0);
  });
}

// Stacking inside the board: stains at the bottom, stickers above in the
// order they were last stuck, then the trash can and anything in flight.
const Z_STICKER = 10;
const Z_CARRIED = 5500;

// Every sticker option, with its default.
export const DEFAULTS = {
  src: "", // an image URL, or a canvas/image you've drawn
  // A link: shown on hover, followed on a quick click (a drag still peels).
  href: null,
  hrefLabel: null, // what the hover label says; defaults to the link itself
  size: 136, // px, the square the image is fitted into
  // Where it starts. Like CSS: left/right/top/bottom place the box's edges
  // (numbers are px, strings any CSS length), or x/y place its centre.
  at: { right: 32, bottom: 28 },
  tilt: -7,
  look: {
    filter: "color", // "color", "mono" or "ink"
    border: 5,
    smoothing: 0.06,
    borderColor: "#ffffff",
    shadow: 0.22,
    gloss: 0.28,
  },
  entrance: {
    delay: 150,
    style: "slap", // "slap", "pop", "peek", or "none" to just be there
    duration: 620,
    bounce: 0.32,
    fromScale: 1.45,
    fromRotate: -18,
    fromLift: 22,
    blur: 4,
  },
  // false, or googly eyes: { left: { x, y }, right: { x, y } } as fractions
  // of the square, plus any of EYES to override.
  eyes: false,
  peel: {
    ripAt: 0.35,
    flick: 1.1,
    hoverLift: 9,
    backColor: "#f1efea",
    curl: 0.6,
    flapShadow: 0.3,
    gravity: 0.0028,
    spin: 0.35,
    flipSpeed: 0.6,
  },
  carry: {
    lift: 1.06,
    flip: 380,
    stiffness: 40,
    droop: 2500,
    sway: 1,
    damping: 3.5,
    shakeOff: 4,
  },
  glue: {
    uses: 5, // sticks before it gives up; the last one fails
    restCurl: 20,
    dust: 1,
    failHold: 900,
  },
  residue: true, // a faint stain where it started
  under: null, // HTML string or element revealed where it started
};

export const EYES = {
  size: 0.066,
  pupil: 0.5,
  white: "#ffffff",
  pupilColor: "#0a0a0a",
  outline: 0.8,
  reach: 1,
  stiffness: 320,
  damping: 9,
  idleAfter: 4500,
  blinkMin: 2400,
  blinkMax: 6500,
  winkOnClick: true,
};

export const BOARD = {
  zIndex: 40,
  appear: "first-move", // or "load", or "manual" (call show())
  minWidth: 0, // hide below this window width
  touch: true, // show on touch screens
  maxDpr: 3, // build pixels at no more than this density (2 is plenty for many stickers)
  trash: { enabled: true, size: 150, worn: true },
  // Hooks, called with the sticker: when it comes in at its starting spot,
  // and each time it's stuck down somewhere new.
  onEnter: null,
  onStick: null,
};

const isPlain = (o) => o && typeof o === "object" && !Array.isArray(o) && !(o instanceof Node);

export function merge(base, over) {
  if (!isPlain(over)) return over === undefined ? base : over;
  const out = { ...base };
  for (const k of Object.keys(over)) out[k] = isPlain(base?.[k]) && isPlain(over[k]) ? merge(base[k], over[k]) : over[k];
  return out;
}

function el(tag, className, parent) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (parent) parent.append(e);
  return e;
}

function entranceFrom(e, at, size) {
  if (e.style === "pop") return `rotate(${e.fromRotate}deg) scale(${e.fromScale})`;
  if (e.style === "peek") {
    const sx = at.left != null ? -1 : 1;
    const sy = at.top != null ? -1 : 1;
    return `translate(${sx * size * 1.2}px, ${sy * size * 0.8}px) rotate(${e.fromRotate}deg)`;
  }
  // "slap": held above the page, then pressed down onto it
  return `translate(0px, ${-e.fromLift}px) rotate(${e.fromRotate}deg) scale(${e.fromScale})`;
}

// The CSS box for a starting position.
function placement(at, S) {
  const v = (n) => (typeof n === "number" ? `${n}px` : n);
  const box = { width: `${S}px`, height: `${S}px`, left: "", top: "", right: "", bottom: "" };
  if (at.x != null) box.left = `calc(${v(at.x)} - ${S / 2}px)`;
  if (at.y != null) box.top = `calc(${v(at.y)} - ${S / 2}px)`;
  for (const k of ["left", "top", "right", "bottom"]) if (at[k] != null) box[k] = v(at[k]);
  return box;
}

// One sticker. Per-frame work (pupils, the peel spring, the fold, carrying it
// around and the falls) is imperative; `render` syncs the DOM to its phase:
// hidden → entering → stuck ⇄ ripping → carried → stuck … → gone.
function createSticker(board, config) {
  const st = {
    cfg: config,
    art: null,
    phase: "hidden",
    spot: null, // where it's stuck when not at its start: centre (px) and angle (deg)
    uses: 0, // times it's been stuck back down
    marks: [], // extra dirt on its paper back, in its own coordinates (addMarks)
    z: Z_STICKER,
    dom: null,
  };
  const eng = {
    pointerType: "mouse",
    v: { x: 0, y: 0 },
    vv: { x: 0, y: 0 },
    hover: null,
    drag: null,
    rip: null,
    fail: null,
    carry: null,
    settleKick: 0,
    raf: 0,
    last: 0,
    rect: null,
    drawn: "",
    off: null,
    back: null,
    backV: 0,
    lastGloss: null,
    blinkTimer: 0,
    idleTimer: 0,
    googly: new Googly(),
  };
  const env = () => board.env;
  const eyesCfg = () => (st.cfg.eyes ? merge(EYES, st.cfg.eyes) : null);

  // Rotation where it's stuck: its starting tilt, or whatever it was slapped
  // down with somewhere else.
  const tilt = () => (st.spot ? st.spot.angle : st.cfg.tilt) * DEG;
  const size = () => st.art.size;
  // 0 when fresh, 1 when the glue is spent.
  const wear = () => Math.min(1, st.uses / Math.max(1, st.cfg.glue.uses));

  function measure() {
    if (st.dom) eng.rect = st.dom.anchor.getBoundingClientRect();
    return eng.rect;
  }

  function toLocal(x, y) {
    const r = eng.rect || measure();
    const s = size();
    const p = rotate(x - (r.left + r.width / 2), y - (r.top + r.height / 2), -tilt());
    return { x: p.x + s / 2, y: p.y + s / 2 };
  }

  function toScreen(x, y) {
    const r = eng.rect || measure();
    const s = size();
    const p = rotate(x - s / 2, y - s / 2, tilt());
    return { x: p.x + r.left + r.width / 2, y: p.y + r.top + r.height / 2 };
  }

  // A worn sticker doesn't lie flat: one edge stays curled up.
  function restCurl() {
    const { spot } = st;
    if (!spot || !spot.curl) return { x: 0, y: 0 };
    const len = st.cfg.glue.restCurl * Math.pow(wear(), 1.3);
    return { x: spot.curl.x * len, y: spot.curl.y * len };
  }

  function setPhase(p) {
    st.phase = p;
    render();
  }

  // ---- DOM ----

  function mount() {
    unmount();
    const { art, cfg } = st;
    const S = art.size;
    const { box } = art;
    const artBox = { left: `${box.x}px`, top: `${box.y}px`, width: `${box.w}px`, height: `${box.h}px` };
    // Silhouette masks (stain, gloss, entrance shadow) are cosmetic, so they
    // wait for the encoded image instead of holding anything up.
    const masked = [];
    const mask = (e) => {
      Object.assign(e.style, artBox);
      masked.push(e);
    };
    // The art itself goes straight onto canvases.
    const paint = (parent) => {
      const c = el("canvas", "art", parent);
      c.width = art.front.width;
      c.height = art.front.height;
      c.getContext("2d").drawImage(art.front, 0, 0);
      Object.assign(c.style, artBox);
      return c;
    };
    const eyes = eyesCfg();
    const root = board.root;
    const dom = {};

    // Where it started: a stain, and whatever was hidden under it.
    dom.home = el("div", "home", root);
    dom.homeTilt = el("div", "tilt", dom.home);
    if (cfg.residue) mask(el("div", "residue", dom.homeTilt));
    if (cfg.under) {
      dom.under = el("div", "under", dom.homeTilt);
      const b = art.bounds;
      dom.under.style.left = `${(b.minX + b.maxX) / 2}px`;
      dom.under.style.top = `${(b.minY + b.maxY) / 2}px`;
      dom.under.style.transform = "translate(-50%, -50%)";
      if (typeof cfg.under === "string") dom.under.innerHTML = cfg.under;
      else dom.under.append(cfg.under);
    }

    dom.anchor = el("div", "anchor", root);
    dom.tilt = el("div", "tilt", dom.anchor);
    dom.air = el("div", "air", dom.tilt);
    dom.airShape = el("div", "air-shape", dom.air);
    mask(dom.airShape);
    dom.enter = el("div", "enter", dom.tilt);
    dom.inner = el("div", "fill", dom.enter);
    // The shadow sits outside the peel clip so it follows the stuck part's
    // outline instead of being cut at the fold.
    dom.press = el("div", "press", dom.inner);
    dom.press.style.filter = `drop-shadow(0 1px 1px rgba(0,0,0,${cfg.look.shadow})) drop-shadow(0 3px 8px rgba(0,0,0,${cfg.look.shadow * 0.45}))`;
    dom.front = el("div", "fill", dom.press);
    paint(dom.front);
    if (cfg.look.gloss > 0) {
      dom.gloss = el("div", "gloss", dom.front);
      mask(dom.gloss);
      dom.gloss.style.opacity = cfg.look.gloss;
    }
    const face = eyes ? buildEyes(dom.front, eyes, S) : { eyeEls: [], pupilEls: [] };
    dom.eyes = face.eyeEls;
    dom.pupils = face.pupilEls;
    dom.flap = el("canvas", "flap", dom.tilt);
    dom.flap.width = dom.flap.height = 0;
    Object.assign(dom.flap.style, { left: `${-S}px`, top: `${-S}px`, width: `${3 * S}px`, height: `${3 * S}px` });
    // The hit area covers the whole cut shape (the border reaches past the
    // square), clipped to its hull so the page around it stays clickable.
    dom.hit = el("div", "hit", dom.tilt);
    Object.assign(dom.hit.style, artBox);
    const hull = `polygon(${art.hull.map(([x, y]) => `${(x - box.x).toFixed(1)}px ${(y - box.y).toFixed(1)}px`).join(", ")})`;
    dom.hit.style.clipPath = dom.hit.style.webkitClipPath = hull;
    board.wireHit(dom.hit);

    // The copy that rides on the cursor and tumbles away.
    dom.flight = el("div", "flight", root);
    Object.assign(dom.flight.style, { width: `${S}px`, height: `${S}px` });
    dom.flightInner = el("div", "flight-inner", dom.flight);
    const ff = el("div", "face", dom.flightInner);
    paint(ff);
    const fface = eyes ? buildEyes(ff, eyes, S) : { eyeEls: [], pupilEls: [] };
    dom.flightEyes = fface.eyeEls;
    dom.flightPupils = fface.pupilEls;
    const fb = el("div", "face face-back", dom.flightInner);
    dom.flightBack = el("canvas", "art", fb);
    Object.assign(dom.flightBack.style, artBox);

    for (const k of ["home", "anchor", "flight"]) dom[k].setAttribute("aria-hidden", "true");
    dom.anchor.style.zIndex = st.z;
    st.dom = dom;
    art.urls.then(({ back }) => {
      masked.forEach((e) => (e.style.webkitMaskImage = e.style.maskImage = `url(${back})`));
    });
    eng.rect = null;
    eng.drawn = "";
    render();
  }

  function unmount() {
    if (!st.dom) return;
    for (const k of ["home", "anchor", "flight"]) st.dom[k].remove();
    st.dom = null;
  }

  function render() {
    const { dom, phase, spot, cfg } = st;
    if (!dom) return;
    const S = st.art.size;
    const onSticker = phase === "entering" || phase === "stuck" || phase === "ripping";
    Object.assign(dom.home.style, placement(cfg.at, S));
    dom.homeTilt.style.transform = `rotate(${cfg.tilt}deg)`;
    if (spot) {
      Object.assign(dom.anchor.style, {
        width: `${S}px`,
        height: `${S}px`,
        left: `${spot.x - S / 2}px`,
        top: `${spot.y - S / 2}px`,
        right: "",
        bottom: "",
      });
    } else {
      Object.assign(dom.anchor.style, placement(cfg.at, S));
    }
    dom.tilt.style.transform = `rotate(${spot ? spot.angle : cfg.tilt}deg)`;
    eng.rect = null;
    dom.anchor.hidden = phase === "hidden";
    dom.home.hidden = phase === "hidden" || phase === "entering";
    dom.air.hidden = dom.enter.hidden = !onSticker;
    dom.hit.hidden = phase !== "stuck" || !!spot?.failing;
    if (dom.under) {
      // Uncovered once the sticker has gone somewhere else.
      const away = !!spot || !onSticker;
      dom.under.dataset.away = away;
      dom.under.inert = !away;
    }
    scheduleBlinks();
  }

  // Random blinks, sometimes a double, stuck or carried.
  function scheduleBlinks() {
    clearTimeout(eng.blinkTimer);
    const eyes = eyesCfg();
    const { phase, dom } = st;
    if (!eyes || !dom || (phase !== "stuck" && phase !== "carried")) return;
    const els = phase === "carried" ? dom.flightEyes : dom.eyes;
    const wait = eyes.blinkMin + Math.random() * Math.max(0, eyes.blinkMax - eyes.blinkMin);
    eng.blinkTimer = setTimeout(() => {
      if (!document.hidden) {
        blink(els);
        if (Math.random() < 0.18) setTimeout(() => blink(els), 220);
      }
      scheduleBlinks();
    }, wait);
  }

  // ---- frame loop ----

  function wake() {
    if (!eng.raf) {
      eng.last = performance.now();
      eng.raf = requestAnimationFrame(tick);
    }
  }

  function tick(now) {
    eng.raf = 0;
    const dt = Math.min(48, now - eng.last);
    eng.last = now;
    const { cfg, art, phase, dom } = st;
    if (!art || !dom || phase === "hidden") return;
    if (eng.carry) {
      stepCarry(dt, now);
      wake();
      return;
    }
    let active = false;

    const eyes = eyesCfg();
    if (eyes && (phase === "entering" || phase === "stuck" || phase === "ripping")) {
      const s = art.size;
      const travel = pupilTravel(eyes, s);
      const idle = !board.cursor || now - board.lastMove > eyes.idleAfter;
      const centers = [eyes.left, eyes.right].map((e) => toScreen(e.x * s, e.y * s));
      const targets = eng.googly.aim(centers, idle ? null : board.cursor, tilt(), travel, s * 0.45);
      // Pupils shrink while it's being peeled off, and go wide when it's slipping.
      eng.googly.scaleTarget = eng.fail || eng.rip?.fall ? 1.25 : eng.drag?.moved || eng.rip ? 0.7 : 1;
      if (eng.googly.step(dt, targets, eyes, travel, env().reduced)) active = true;
      eng.googly.apply(dom.pupils);
    }

    if (eng.rip) {
      if (stepRip(dt)) active = true;
    } else if (!eng.drag && phase === "stuck") {
      const f = eng.fail;
      let t;
      if (f) {
        // Only part of it takes: the top flops over and wobbles, then lets go.
        const age = now - f.t0;
        t = age < 160 ? { x: 0, y: 0 } : { x: f.dx * f.len, y: f.dy * f.len };
        if (age > cfg.glue.failHold) {
          eng.fail = null;
          eng.rip = { dx: f.dx, dy: f.dy, len: Math.max(1, Math.hypot(eng.v.x, eng.v.y)), speed: 0.02, fall: true };
          setPhase("ripping");
        }
        active = true;
      } else {
        const rest = restCurl();
        const h = eng.hover || { x: 0, y: 0 };
        t = { x: rest.x + h.x, y: rest.y + h.y };
      }
      // Critically damped, so a released peel snaps flat without overshooting
      // onto the opposite edge. Loose and wobbly when it's failing.
      const k = f ? 170 : 520;
      const c = f ? 7 : 2 * Math.sqrt(k);
      let left = dt / 1000;
      while (left > 0) {
        const h = Math.min(left, 0.004);
        left -= h;
        eng.vv.x += (-k * (eng.v.x - t.x) - c * eng.vv.x) * h;
        eng.vv.y += (-k * (eng.v.y - t.y) - c * eng.vv.y) * h;
        eng.v.x += eng.vv.x * h;
        eng.v.y += eng.vv.y * h;
      }
      const off = Math.abs(eng.v.x - t.x) + Math.abs(eng.v.y - t.y);
      if (off > 0.05 || Math.abs(eng.vv.x) + Math.abs(eng.vv.y) > 0.5) active = true;
      else eng.v = { ...t };
      if (eng.settleKick && Math.hypot(eng.v.x - t.x, eng.v.y - t.y) < 2) {
        // thwack: it slaps back down and the pupils rattle
        eng.googly.kick(Math.min(1.2, eng.settleKick / 50));
        eng.settleKick = 0;
        active = true;
      }
    }
    drawPeel();

    if (dom.gloss && board.cursor && board.cursor !== eng.lastGloss) {
      eng.lastGloss = board.cursor;
      dom.gloss.style.backgroundPosition = `${(1 - board.cursor.x / window.innerWidth) * 100}% 0`;
    }

    if (active || eng.drag) wake();
  }

  function drawPeel() {
    const { art, dom } = st;
    const key = `${eng.v.x.toFixed(2)},${eng.v.y.toFixed(2)},${art.size},${art.dpr},${eng.backV}`;
    if (key === eng.drawn) return;
    eng.drawn = key;
    const s = art.size;
    const g = fold(eng.v, art);
    const box = [-s, -s, 2 * s, 2 * s];
    let clip = "";
    if (g) {
      const poly = clipBox(-g.dx, -g.dy, -g.c, box);
      clip =
        poly.length < 3
          ? "inset(50%)"
          : `polygon(${poly.map(([x, y]) => `${x.toFixed(2)}px ${y.toFixed(2)}px`).join(", ")})`;
    }
    dom.front.style.clipPath = clip;
    dom.front.style.webkitClipPath = clip;
    drawFlap(g);
  }

  // The lifted part, drawn as the sticker's paper back reflected across the
  // fold, with a crease shadow and a highlight where it curls.
  function drawFlap(g) {
    const canvas = st.dom?.flap;
    if (!canvas) return;
    const { art, cfg } = st;
    const s = art.size;
    const dpr = art.dpr;
    // Only peeling stickers hold a full-size canvas.
    if (!g) {
      canvas.width = canvas.height = 0;
      return;
    }
    const W = Math.round(3 * s * dpr);
    if (canvas.width !== W) canvas.width = canvas.height = W;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, W);
    const poly = clipBox(g.dx, g.dy, g.c, [-s, -s, 2 * s, 2 * s]);
    if (poly.length < 3) return;

    const off = board.scratch(W);
    const o = off.getContext("2d");
    o.setTransform(1, 0, 0, 1, 0, 0);
    o.clearRect(0, 0, W, W);
    o.save();
    o.setTransform(dpr, 0, 0, dpr, s * dpr, s * dpr);
    o.transform(...reflection(g));
    o.beginPath();
    poly.forEach(([x, y], i) => (i ? o.lineTo(x, y) : o.moveTo(x, y)));
    o.closePath();
    o.clip();
    o.drawImage(eng.back || art.back, art.box.x, art.box.y, art.box.w, art.box.h);

    const center = s / 2;
    const at = g.c - (g.dx + g.dy) * center; // fold position along d
    const fx = center + g.dx * at;
    const fy = center + g.dy * at;
    const half = g.len / 2;
    const grad = o.createLinearGradient(fx, fy, fx - g.dx * half, fy - g.dy * half);
    const k = cfg.peel.curl;
    grad.addColorStop(0, `rgba(0,0,0,${0.22 * k})`);
    grad.addColorStop(Math.min(0.5, 3 / half), "rgba(255,255,255,0)");
    grad.addColorStop(Math.min(0.6, 0.3), `rgba(255,255,255,${0.65 * k})`);
    grad.addColorStop(0.75, "rgba(255,255,255,0)");
    grad.addColorStop(1, `rgba(0,0,0,${0.1 * k})`);
    o.globalCompositeOperation = "source-atop";
    o.fillStyle = grad;
    o.fillRect(-s, -s, 3 * s, 3 * s);
    o.restore();

    // Contact shadow where the curl lifts off the page: soft along the crease,
    // on the uncovered side only. The band is drawn far off-canvas so only
    // its blurred shadow lands, clipped to the lifted half.
    const runs = creaseRuns(g, art);
    if (runs.length) {
      const lift = Math.min(1, g.len / 40);
      const far = 4 * s;
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, s * dpr, s * dpr);
      ctx.beginPath();
      poly.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.clip();
      ctx.beginPath();
      runs.forEach(([a, b]) => {
        ctx.moveTo(a[0] - far, a[1]);
        ctx.lineTo(b[0] - far, b[1]);
      });
      ctx.lineCap = "round";
      ctx.lineWidth = 4 + 6 * lift;
      ctx.strokeStyle = "#000";
      ctx.shadowColor = `rgba(0,0,0,${cfg.peel.flapShadow * 0.5 * lift})`;
      ctx.shadowBlur = (3 + 5 * lift) * dpr;
      ctx.shadowOffsetX = (far - g.dx * 2 * lift) * dpr;
      ctx.shadowOffsetY = -g.dy * 2 * lift * dpr;
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.shadowColor = `rgba(0,0,0,${cfg.peel.flapShadow})`;
    ctx.shadowBlur = 6 * dpr;
    ctx.shadowOffsetY = 2 * dpr;
    ctx.drawImage(off, 0, 0);
    ctx.restore();
  }

  // ---- peeling off ----

  function stepRip(dt) {
    const r = eng.rip;
    // A rip runs away from you; a failing sticker slides off slowly, then faster.
    if (r.fall) r.speed = Math.min(r.speed + 0.0011 * dt, 3);
    else r.speed = Math.min(r.speed * (1 + dt * 0.006), 5);
    r.len += r.speed * dt;
    eng.v = { x: r.dx * r.len, y: r.dy * r.len };
    const g = fold(eng.v, st.art);
    if (g && g.progress >= 1) {
      drawPeel();
      eng.rip = null;
      if (r.fall) dropOff(g);
      // A finger that let go early has nothing to hold it by: thrown away.
      else if (eng.pointerType === "touch" && !(r.held && board.touchDown())) launch(g, r.release);
      else pickup(g);
      return false;
    }
    return true;
  }

  function startRip(g, speed, held) {
    eng.drag = null;
    press(false);
    eng.rip = { dx: g.dx, dy: g.dy, len: g.len, speed: Math.max(speed, 1.2), release: speed, held };
    setPhase("ripping");
    wake();
  }

  // Where the fully folded sticker is on screen: reflected across the last
  // fold, paper side up.
  function foldPose(g) {
    const s = size();
    const center = s / 2;
    const r = measure();
    const t = tilt();
    const dist = (g.dx + g.dy) * center - g.c;
    const off = rotate(-2 * dist * g.dx, -2 * dist * g.dy, t);
    return {
      x: r.left + r.width / 2 + off.x,
      y: r.top + r.height / 2 + off.y,
      angle: t + 2 * Math.atan2(g.dx, -g.dy) + Math.PI,
      flip: 180,
      scale: 1,
    };
  }

  // The stuck copy steps aside for the flying one.
  function leave() {
    st.dom.front.style.visibility = "hidden";
    eng.v = { x: 0, y: 0 };
    eng.vv = { x: 0, y: 0 };
    eng.drawn = "";
    drawFlap(null);
  }

  function placeFlight(p) {
    const { flight, flightInner } = st.dom;
    const s = size();
    flight.style.transform = `translate(${(p.x - s / 2).toFixed(2)}px, ${(p.y - s / 2).toFixed(2)}px) rotate(${p.angle.toFixed(4)}rad)`;
    flightInner.style.transform = `perspective(${s * 6}px) rotateY(${p.flip.toFixed(2)}deg) scale(${p.scale.toFixed(3)})`;
  }

  // The flying copy's paper side, dirt and all.
  function paintBack() {
    const c = st.dom?.flightBack;
    const back = eng.back || st.art?.back;
    if (!c || !back || c.dataset.v === String(eng.backV)) return;
    c.width = back.width;
    c.height = back.height;
    c.getContext("2d").drawImage(back, 0, 0);
    c.dataset.v = String(eng.backV);
  }

  function hideFlight() {
    const { dom } = st;
    if (!dom) return;
    dom.flight.style.visibility = "hidden";
    dom.flight.getAnimations().forEach((a) => a.cancel());
    dom.flightInner.getAnimations().forEach((a) => a.cancel());
  }

  // Fully peeled: it flips face up and stays stuck to the cursor (or finger),
  // held by the edge you pulled.
  function pickup(g) {
    const pose = foldPose(g);
    const trailing = st.art.support(-g.dx, -g.dy);
    const t = tilt();
    const psi = pose.angle - t;
    eng.carry = {
      G: { x: -g.dx * trailing, y: -g.dy * trailing },
      theta: t,
      omega: 0,
      rest: t,
      psi: Math.atan2(Math.sin(psi), Math.cos(psi)),
      from: { x: pose.x, y: pose.y },
      t0: performance.now(),
      lastP: board.cursor || { x: pose.x, y: pose.y },
      vx: 0,
      vy: 0,
      ax: 0,
      ay: 0,
      cv: { x: 0, y: 0 },
      pose,
      touch: eng.pointerType === "touch",
    };
    leave();
    hideFlight();
    paintBack();
    eng.googly.apply(st.dom.flightPupils);
    placeFlight(pose);
    st.dom.flight.style.zIndex = Z_CARRIED;
    st.dom.flight.style.visibility = "visible";
    board.carry(api);
    setPhase("carried");
    wake();
  }

  function stepCarry(dt, now) {
    const c = eng.carry;
    const { cfg, art, dom } = st;
    const k = cfg.carry;
    const s = art.size;
    const h = Math.max(dt, 1) / 1000;
    const P = board.cursor || c.lastP;
    // The hand: pivot velocity and acceleration (px/s, px/s²).
    const vx = (P.x - c.lastP.x) / h;
    const vy = (P.y - c.lastP.y) / h;
    const lim = 60000;
    c.ax += (clamp((vx - c.vx) / h, -lim, lim) - c.ax) * 0.5;
    c.ay += (clamp((vy - c.vy) / h, -lim, lim) - c.ay) * 0.5;
    c.vx = vx;
    c.vy = vy;
    c.lastP = P;

    // It hangs off the pivot like stiff paper: a spring holds its angle,
    // gravity droops it and the hand's acceleration swings it.
    if (env().reduced) {
      c.theta = c.rest;
      c.omega = 0;
    } else {
      let left = h;
      while (left > 0) {
        const step = Math.min(left, 0.004);
        left -= step;
        const r = rotate(-c.G.x, -c.G.y, c.theta);
        const I = r.x * r.x + r.y * r.y + (s * s) / 6;
        const fx = -k.sway * c.ax;
        const fy = k.droop - k.sway * c.ay;
        const alpha = (r.x * fy - r.y * fx) / I - k.stiffness * (c.theta - c.rest) - k.damping * c.omega;
        c.omega += alpha * step;
        c.theta += c.omega * step;
      }
    }

    // Turning over from the paper side to the face as it comes off.
    const e = env().reduced ? 1 : easeOut(Math.min(1, (now - c.t0) / k.flip));
    const angle = c.theta + c.psi * (1 - e);
    const off = rotate(-c.G.x, -c.G.y, angle);
    const x = c.from.x + (P.x + off.x - c.from.x) * e;
    const y = c.from.y + (P.y + off.y - c.from.y) * e;
    const d = Math.max(dt, 1);
    c.cv.x += ((x - c.pose.x) / d - c.cv.x) * 0.4;
    c.cv.y += ((y - c.pose.y) / d - c.cv.y) * 0.4;
    c.pose = { x, y, angle, flip: 180 * (1 - e), scale: 1 + (k.lift - 1) * e };
    placeFlight(c.pose);

    const eyes = eyesCfg();
    if (eyes) {
      const travel = pupilTravel(eyes, s);
      const centers = [eyes.left, eyes.right].map((p) => {
        const q = rotate(p.x * s - s / 2, p.y * s - s / 2, angle);
        return { x: x + q.x, y: y + q.y };
      });
      const idle = !board.cursor || now - board.lastMove > eyes.idleAfter;
      const a = rotate(c.ax, c.ay, -angle);
      eng.googly.push(a.x, a.y, dt);
      eng.googly.scaleTarget = board.trailSpeed(now) > k.shakeOff * 0.55 ? 0.7 : 1;
      eng.googly.step(dt, eng.googly.aim(centers, idle ? null : board.cursor, angle, travel, s * 0.45), eyes, travel, env().reduced);
      eng.googly.apply(dom.flightPupils);
    }
  }

  // Slapped down wherever it's being held. A finger lifting always sticks it.
  function stick(force) {
    const c = eng.carry;
    if (!c || (!force && performance.now() - c.t0 < st.cfg.carry.flip * 0.6)) return;
    const s = size();
    eng.carry = null;
    board.carry(null);
    const x = clamp(c.pose.x, s * 0.15, window.innerWidth - s * 0.15);
    const y = clamp(c.pose.y, s * 0.15, window.innerHeight - s * 0.15);
    const dx = c.pose.x - x;
    const dy = c.pose.y - y;
    const next = st.uses + 1;
    const a = Math.random() * Math.PI * 2;
    const angle = c.pose.angle / DEG;
    st.spot = {
      x,
      y,
      angle: (((angle % 360) + 540) % 360) - 180,
      curl: { x: Math.cos(a), y: Math.sin(a) },
      failing: next >= st.cfg.glue.uses,
    };
    st.uses = next;
    eng.hover = null;
    eng.v = { x: 0, y: 0 };
    eng.vv = { x: 0, y: 0 };
    eng.drawn = "";
    st.dom.front.style.visibility = "";
    st.phase = "stuck";
    board.toFront(api);
    render();
    hideFlight();
    measure();
    // The paper back picks up dirt every time it's stuck down.
    setDust(st.uses);
    board.opts.onStick?.(api);
    animateLand(dx, dy);
    if (st.spot.failing) startFail();
    wake();
  }

  // Shaken off the cursor: it flies off with the hand's momentum.
  function shakeOff() {
    const c = eng.carry;
    if (!c) return;
    eng.carry = null;
    board.carry(null);
    const { cfg } = st;
    const v = { x: clamp(c.cv.x, -1.4, 1.4), y: clamp(c.cv.y, -1.4, 1.4) };
    const dir = v.x >= 0 ? 1 : -1;
    setPhase("gone");
    const spin = clamp(c.omega / 1000, -0.012, 0.012) + cfg.peel.spin * DEG * 0.6 * dir;
    fall(c.pose, v, spin, cfg.peel.flipSpeed * dir, board.opts.trash.enabled);
  }

  // The last try gave up: it slides off the screen and drops.
  function dropOff(g) {
    const { cfg } = st;
    const pose = foldPose(g);
    const dir = rotate(g.dx, g.dy, tilt());
    const side = dir.x >= 0 ? 1 : -1;
    leave();
    setPhase("gone");
    const trash = board.opts.trash;
    fall(pose, { x: dir.x * 0.06, y: 0.02 }, 0.12 * DEG * side, cfg.peel.flipSpeed * 0.6 * side, trash.enabled && trash.worn);
  }

  // Ripped off by a finger that let go: thrown away, into the trash.
  function launch(g, speed) {
    const { cfg } = st;
    const pose = foldPose(g);
    const dir = rotate(g.dx, g.dy, tilt());
    const v0 = clamp(speed * 0.6, 0.3, 1.1);
    leave();
    setPhase("gone");
    const spin = cfg.peel.spin * DEG * (dir.x >= 0 ? 1 : -1);
    fall(pose, { x: dir.x * v0, y: dir.y * v0 - 0.35 }, spin, cfg.peel.flipSpeed, board.opts.trash.enabled);
  }

  // Free flight under gravity, tumbling and flipping: into the trash can, or
  // off the bottom of the screen.
  function fall(pose, vel, spin, flipRate, intoTrash) {
    const { cfg, art, dom } = st;
    if (env().reduced || !dom) {
      hideFlight();
      return;
    }
    const s = art.size;
    const grav = Math.max(0.0006, cfg.peel.gravity);
    const vx = vel.x;
    let vy = vel.y;
    let T = Infinity;
    let D;
    let land = 0;
    let mouth = 0;
    if (intoTrash) {
      const m = canMouth(board.opts.trash.size);
      mouth = m.y;
      const dy = m.y - pose.y;
      // Time to reach the can, but long enough for the can to show up.
      T = (-vy + Math.sqrt(Math.max(0, vy * vy + 2 * grav * dy))) / grav;
      if (!(T >= 650)) T = 650;
      T = Math.min(T, 1500);
      vy = (dy - 0.5 * grav * T * T) / T;
      const margin = m.half + 16;
      land = clamp(pose.x + vx * T, margin, window.innerWidth - margin);
      D = T + 220;
      board.catch(land, T, pose.x < land ? -1 : 1);
    } else {
      const dy = window.innerHeight + s - pose.y;
      D = clamp((-vy + Math.sqrt(Math.max(0, vy * vy + 2 * grav * dy))) / grav, 600, 2400);
    }

    const N = 60;
    const outerFrames = [];
    const innerFrames = [];
    for (let i = 0; i <= N; i++) {
      const t = (D * i) / N;
      let x = pose.x + vx * t;
      let y = pose.y + vy * t + 0.5 * grav * t * t;
      let scale;
      let opacity = 1;
      if (intoTrash) {
        // Sideways motion dies out (air drag), so it drops in from above.
        const u = Math.min(1, t / T);
        x = pose.x + (land - pose.x) * (1 - (1 - u) * (1 - u));
        // Smaller as it drops into the can; then down inside, behind the front.
        scale = pose.scale + (0.58 - pose.scale) * smoothstep(T * 0.45, T, t);
        if (t > T) {
          x = land;
          y = mouth + (t - T) * 0.5;
          scale = 0.58 - 0.1 * ((t - T) / (D - T));
          opacity = 1 - (t - T) / (D - T);
        }
      } else {
        scale = pose.scale + 0.12 * Math.min(1, t / 200);
        if (t > D * 0.88) opacity = 1 - (t - D * 0.88) / (D * 0.12);
      }
      const turn = intoTrash ? spin * t * (1 - (0.5 * Math.min(t, T)) / T) : spin * t;
      outerFrames.push({
        transform: `translate(${(x - s / 2).toFixed(2)}px, ${(y - s / 2).toFixed(2)}px) rotate(${(pose.angle + turn).toFixed(4)}rad)`,
        opacity,
      });
      innerFrames.push({
        transform: `perspective(${s * 6}px) rotateY(${(pose.flip + flipRate * t).toFixed(2)}deg) scale(${scale.toFixed(3)})`,
      });
    }
    dom.flight.getAnimations().forEach((a) => a.cancel());
    dom.flightInner.getAnimations().forEach((a) => a.cancel());
    paintBack();
    eng.googly.apply(dom.flightPupils);
    dom.flight.style.zIndex = Z.falling;
    dom.flight.style.visibility = "visible";
    const a = dom.flight.animate(outerFrames, { duration: D, fill: "forwards" });
    dom.flightInner.animate(innerFrames, { duration: D, fill: "forwards" });
    a.onfinish = hideFlight;
  }

  function press(on) {
    if (st.dom) st.dom.press.style.transform = on ? "scale(0.97)" : "";
  }

  function boop() {
    const eyes = eyesCfg();
    if (!env().reduced) {
      const { easing, duration } = springEasing(0.45, 0.5);
      st.dom.press.animate([{ transform: "scale(0.93)" }, { transform: "scale(1)" }], { duration, easing });
    }
    if (eyes?.winkOnClick) blink([st.dom.eyes[1]], 260);
    eng.googly.kick(0.6);
    wake();
  }

  // A quick click on a sticker with a link: a little press, then off it goes.
  function follow() {
    const { href } = st.cfg;
    if (!env().reduced) {
      const { easing, duration } = springEasing(0.35, 0.4);
      st.dom.press.animate([{ transform: "scale(0.94)" }, { transform: "scale(1)" }], { duration, easing });
    }
    if (/^https?:\/\//.test(href)) window.open(href, "_blank", "noopener,noreferrer");
    else window.location.assign(href);
  }

  function releaseSpeed(d, g, now) {
    const h = d.history;
    const a = h[0];
    const b = h[h.length - 1];
    if (!g || now - b.t > 80 || b.t - a.t < 8) return 0;
    return ((b.x - a.x) * g.dx + (b.y - a.y) * g.dy) / (b.t - a.t);
  }

  // The last try: it lands, but only partly sticks.
  function startFail() {
    const j = (Math.random() - 0.5) * 0.7;
    const d = rotate(Math.sin(j), Math.cos(j), -tilt());
    const len = 0.6 * (st.art.support(-d.x, -d.y) + st.art.support(d.x, d.y));
    eng.fail = { t0: performance.now(), dx: d.x, dy: d.y, len };
    wake();
  }

  function setDust(level) {
    const { art, cfg } = st;
    if (!art) return;
    eng.back = level > 0 || st.marks.length ? dirtyBack(art, level, cfg.glue.dust, st.marks) : art.back;
    eng.backV += 1;
    paintBack();
    wake();
  }

  // ---- motion in and down ----

  // Slapped onto the page with a spring, pupils rattling as it lands.
  function animateEnter() {
    const { dom, cfg } = st;
    const { enter, inner, airShape } = dom;
    [enter, inner, airShape].forEach((n) => n.getAnimations().forEach((a) => a.cancel()));
    const e = cfg.entrance;
    if (e.style === "none") {
      setPhase("stuck");
      measure();
      wake();
      return;
    }
    let main;
    if (env().reduced) {
      main = inner.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: "ease" });
    } else {
      const { easing, duration } = springEasing(e.duration / 1000, e.bounce);
      main = enter.animate([{ transform: entranceFrom(e, cfg.at, st.art.size) }, { transform: "none" }], {
        duration,
        easing,
      });
      inner.animate(
        [
          { opacity: 0, filter: `blur(${e.blur}px)` },
          { opacity: 1, filter: "blur(0px)" },
        ],
        { duration: Math.min(280, e.duration * 0.45), easing: EASE_OUT }
      );
      if (e.style !== "peek") {
        airShape.animate(
          [
            {
              opacity: 0.3,
              transform: `translate(${e.fromLift * 0.35}px, ${e.fromLift * 0.9}px) rotate(${e.fromRotate}deg) scale(${e.fromScale})`,
            },
            { opacity: 0, transform: "none" },
          ],
          { duration: e.duration * 0.6, easing: EASE_OUT, fill: "both" }
        );
      }
      setTimeout(() => {
        eng.googly.kick(1);
        wake();
      }, e.duration * 0.4);
    }
    main.onfinish = () => {
      if (st.phase === "entering") setPhase("stuck");
    };
    measure();
    wake();
  }

  // From where it was held (and how big, lifted off the screen) down onto it.
  function animateLand(dx, dy) {
    const { dom, cfg, spot } = st;
    [dom.enter, dom.inner, dom.airShape].forEach((n) => n.getAnimations().forEach((a) => a.cancel()));
    if (!env().reduced) {
      const p = rotate(dx, dy, -spot.angle * DEG);
      const { easing, duration } = springEasing(0.38, 0.35);
      dom.enter.animate(
        [{ transform: `translate(${p.x}px, ${p.y}px) scale(${cfg.carry.lift})` }, { transform: "none" }],
        { duration, easing }
      );
    }
    setTimeout(() => {
      eng.googly.kick(0.8);
      wake();
    }, 90);
  }

  // ---- input (routed here by the board) ----

  const input = {
    contains(x, y) {
      if (st.phase !== "stuck" || eng.fail || !st.art) return false;
      const p = toLocal(x, y);
      return st.art.hit(p.x, p.y);
    },
    down(e) {
      measure();
      const p = toLocal(e.clientX, e.clientY);
      eng.pointerType = e.pointerType;
      eng.drag = {
        id: e.pointerId,
        start: p,
        v0: { ...eng.v },
        t0: e.timeStamp,
        moved: false,
        history: [{ t: e.timeStamp, x: p.x, y: p.y }],
      };
      press(true);
      wake();
    },
    move(e) {
      const d = eng.drag;
      if (!d || e.pointerId !== d.id) return;
      const p = toLocal(e.clientX, e.clientY);
      const dx = p.x - d.start.x;
      const dy = p.y - d.start.y;
      if (!d.moved && Math.hypot(dx, dy) > 3) {
        d.moved = true;
        press(false);
      }
      eng.v = { x: d.v0.x + dx, y: d.v0.y + dy };
      eng.vv = { x: 0, y: 0 };
      d.history.push({ t: e.timeStamp, x: p.x, y: p.y });
      while (d.history.length > 2 && e.timeStamp - d.history[0].t > 100) d.history.shift();
      const g = fold(eng.v, st.art);
      if (g && g.progress >= 1) startRip(g, releaseSpeed(d, g, e.timeStamp), true);
      wake();
    },
    up(e) {
      const d = eng.drag;
      if (!d || e.pointerId !== d.id) return false;
      const { art, cfg } = st;
      eng.drag = null;
      press(false);
      if (!d.moved) {
        if (e.type === "pointerup" && e.timeStamp - d.t0 < 400) {
          if (cfg.href) follow();
          else boop();
        }
        wake();
        return true;
      }
      const g = fold(eng.v, art);
      const speed = releaseSpeed(d, g, e.timeStamp);
      // Less glue, less effort.
      const ripAt = cfg.peel.ripAt * (1 - 0.6 * wear());
      if (g && (g.progress >= ripAt || (speed >= cfg.peel.flick && g.progress > 0.06))) {
        startRip(g, speed, false);
      } else {
        eng.settleKick = g ? g.len : 0;
      }
      wake();
      return true;
    },
    // Hovering: the edge nearest the cursor lifts a little, inviting a peel.
    // A worn sticker lifts more readily.
    hover(x, y) {
      if (x == null) {
        eng.hover = null;
        wake();
        return;
      }
      const p = toLocal(x, y);
      const b = st.art.bounds;
      const cx = (b.minX + b.maxX) / 2;
      const cy = (b.minY + b.maxY) / 2;
      const dx = p.x - cx;
      const dy = p.y - cy;
      const dist = Math.hypot(dx, dy) || 1;
      const reach = Math.max(b.maxX - b.minX, b.maxY - b.minY) / 2;
      const lift = st.cfg.peel.hoverLift * (1 + wear()) * smoothstep(0.15, 0.8, dist / reach);
      eng.hover = { x: (-dx / dist) * lift, y: (-dy / dist) * lift };
      wake();
    },
  };

  // ---- public ----

  const api = {
    get config() {
      return st.cfg;
    },
    get phase() {
      return st.phase;
    },
    get uses() {
      return st.uses;
    },
    get z() {
      return st.z;
    },
    setZ(z) {
      st.z = z;
      if (st.dom) st.dom.anchor.style.zIndex = z;
    },
    input,
    // Adds dirt to its paper back: specks from makeSpeck (dust.js), each with
    // lx/ly in its own coordinates (see covers) and an optional turn.
    addMarks(marks) {
      st.marks.push(...marks);
      setDust(st.uses);
    },
    // Roughly where it is on screen: a circle (centre and radius, px) that
    // holds the whole sticker however it's turned.
    reach() {
      if (!st.art || !st.dom) return null;
      const r = measure();
      const { box } = st.art;
      const half = Math.max(-box.x, -box.y, box.x + box.w - st.art.size, box.y + box.h - st.art.size, 0) + st.art.size / 2;
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: half * Math.SQRT2 };
    },
    // Is this screen point under the sticker where it sits now (any phase)?
    // Returns the point in its own coordinates, or null.
    covers(x, y) {
      if (!st.art || !st.dom) return null;
      const p = toLocal(x, y);
      return st.art.hit(p.x, p.y) ? { lx: p.x, ly: p.y, turn: -tilt() } : null;
    },
    // Builds the pixels (off the critical path) and the DOM.
    async prepare() {
      const { cfg } = st;
      st.art = await buildArt({
        src: cfg.src,
        size: cfg.size,
        dpr: env().dpr,
        border: cfg.look.border,
        smoothing: cfg.look.smoothing,
        borderColor: cfg.look.borderColor,
        backColor: cfg.peel.backColor,
        filter: cfg.look.filter,
      });
      mount();
      setDust(st.uses);
      return api;
    },
    // A fresh sticker back where it started.
    enter() {
      if (!st.art || !st.dom) return;
      if (eng.carry) board.carry(null);
      eng.v = { x: 0, y: 0 };
      eng.vv = { x: 0, y: 0 };
      eng.rip = null;
      eng.drag = null;
      eng.hover = null;
      eng.fail = null;
      eng.carry = null;
      eng.settleKick = 0;
      eng.drawn = "";
      eng.googly.reset();
      hideFlight();
      drawFlap(null);
      st.spot = null;
      st.uses = 0;
      st.marks = [];
      setDust(0);
      st.dom.front.style.visibility = "";
      st.dom.front.style.clipPath = st.dom.front.style.webkitClipPath = "";
      setPhase("entering");
      board.entered(api);
      animateEnter();
    },
    // Change options live (the lab does this). Rebuilds pixels when needed.
    async update(next) {
      const prev = st.cfg;
      st.cfg = merge(prev, next);
      const pixels = ["src", "size"].some((k) => prev[k] !== st.cfg[k]) ||
        ["filter", "border", "smoothing", "borderColor"].some((k) => prev.look[k] !== st.cfg.look[k]) ||
        prev.peel.backColor !== st.cfg.peel.backColor;
      if (!st.art) return;
      if (pixels) await api.prepare();
      else mount();
      if (st.phase === "carried" || st.phase === "gone") st.dom.front.style.visibility = "hidden";
      wake();
    },
    stick,
    shakeOff,
    wake,
    measure,
    isCarried: () => !!eng.carry,
    carriedByTouch: () => !!eng.carry?.touch,
    carriedSince: () => eng.carry?.t0 ?? Infinity,
    onCursorMove() {
      const eyes = eyesCfg();
      if (eyes) {
        clearTimeout(eng.idleTimer);
        eng.idleTimer = setTimeout(wake, eyes.idleAfter + 30);
      }
      wake();
    },
    onResize() {
      if (st.spot && st.art) {
        const s = st.art.size;
        st.spot.x = clamp(st.spot.x, s * 0.15, window.innerWidth - s * 0.15);
        st.spot.y = clamp(st.spot.y, s * 0.15, window.innerHeight - s * 0.15);
      }
      render();
      measure();
      eng.drawn = "";
      wake();
    },
    destroy() {
      cancelAnimationFrame(eng.raf);
      clearTimeout(eng.blinkTimer);
      clearTimeout(eng.idleTimer);
      unmount();
    },
  };
  return api;
}

// The board owns what stickers share: the shadow root they live in, the
// cursor, the trash can, the layer that catches the click that sticks a
// carried sticker down, and who's on top.
export function createBoard(options = {}) {
  const opts = merge(BOARD, options);
  const host = document.createElement("div");
  host.setAttribute("data-sticker", "");
  host.style.cssText = `position:fixed;inset:0;pointer-events:none;z-index:${opts.zIndex}`;
  const root = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = CSS;
  root.append(style);
  document.body.append(host);

  const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const stickers = [];
  let armed = false;
  let order = 0;
  let carried = null;
  let drag = null;
  let hovered = null;
  let can = null;
  let stopCatch = null;
  let scratchCanvas = null;
  let queue = Promise.resolve();
  const fingers = new Set();
  const entering = [];

  const carryLayer = el("div", "carry", root);
  carryLayer.setAttribute("aria-hidden", "true");

  // The label that shows a sticker's link while you hover it.
  const tip = el("div", "tip", root);
  tip.setAttribute("aria-hidden", "true");
  function showTip(sticker, x, y) {
    const { href, hrefLabel } = sticker?.config || {};
    if (!href) {
      tip.dataset.on = false;
      return;
    }
    tip.textContent = `${hrefLabel || href.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")} ↗`;
    tip.style.transform = `translate(${Math.round(x + 14)}px, ${Math.round(y + 18)}px)`;
    tip.dataset.on = true;
  }

  const board = {
    opts,
    root,
    host,
    env: { reduced: reduced.matches, fine: fine.matches, dpr: Math.min(opts.maxDpr, window.devicePixelRatio || 1) },
    cursor: null,
    lastMove: 0,
    trail: [],

    // How fast the cursor has been travelling lately, along its path (px/ms).
    trailSpeed(now) {
      const t = board.trail;
      if (t.length < 2 || now - t[t.length - 1].t > 90) return 0;
      const span = t[t.length - 1].t - t[0].t;
      if (span < 16) return 0;
      let len = 0;
      for (let i = 1; i < t.length; i++) len += Math.hypot(t[i].x - t[i - 1].x, t[i].y - t[i - 1].y);
      return len / span;
    },

    // One offscreen canvas for drawing flaps, shared by every sticker.
    scratch(w) {
      if (!scratchCanvas) scratchCanvas = document.createElement("canvas");
      if (scratchCanvas.width !== w) scratchCanvas.width = scratchCanvas.height = w;
      return scratchCanvas;
    },

    carry(sticker) {
      carried = sticker;
      carryLayer.dataset.on = !!sticker;
      // Let go of any pointer capture so the finger's moves and lift reach us.
      if (sticker && drag?.capture) {
        try {
          drag.capture.el.releasePointerCapture(drag.capture.id);
        } catch {
          // already released
        }
      }
      if (sticker) drag = null;
    },

    toFront(sticker) {
      order += 1;
      sticker.setZ(Z_STICKER + order);
    },

    touchDown: () => fingers.size > 0,

    // Stickers that just came in, handed to onEnter together at the next
    // frame, so the browser measures them all in one layout.
    entered(sticker) {
      if (!opts.onEnter) return;
      entering.push(sticker);
      if (entering.length === 1) {
        requestAnimationFrame(() => {
          const batch = entering.splice(0);
          batch.forEach((s) => s.measure());
          batch.forEach((s) => opts.onEnter(s));
        });
      }
    },

    catch(x, T, side) {
      if (!opts.trash.enabled) return;
      if (!can) can = buildTrashCan(root, opts.trash.size);
      stopCatch?.();
      stopCatch = playCatch(can, { x, T, side });
    },

    // Every sticker's hit area reports here, so overlapping stickers resolve
    // to whichever one is on top under the pointer.
    wireHit(hit) {
      hit.addEventListener("pointerdown", onHitDown);
      hit.addEventListener("pointermove", onHitMove);
      hit.addEventListener("pointerup", onHitUp);
      hit.addEventListener("pointercancel", onHitUp);
      hit.addEventListener("pointerleave", onHitLeave);
    },
  };

  function pick(x, y) {
    let best = null;
    for (const s of stickers) if (s.input.contains(x, y) && (!best || s.z > best.z)) best = s;
    return best;
  }

  function onHitDown(e) {
    if (e.button > 0 || carried || drag) return;
    const s = pick(e.clientX, e.clientY);
    if (!s) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // not an active pointer (synthetic events); moves still bubble here
    }
    e.currentTarget.style.cursor = "grabbing";
    drag = { sticker: s, capture: { el: e.currentTarget, id: e.pointerId } };
    if (hovered && hovered !== s) hovered.input.hover(null);
    hovered = null;
    showTip(null);
    s.input.down(e);
  }

  function onHitMove(e) {
    if (drag) {
      drag.sticker.input.move(e);
      return;
    }
    const s = pick(e.clientX, e.clientY);
    e.currentTarget.style.cursor = s ? (s.config.href ? "pointer" : "grab") : "";
    if (hovered && hovered !== s) hovered.input.hover(null);
    hovered = s;
    if (s) s.input.hover(e.clientX, e.clientY);
    showTip(s, e.clientX, e.clientY);
  }

  function onHitUp(e) {
    if (!drag) return;
    const s = drag.sticker;
    drag = null;
    e.currentTarget.style.cursor = s.config.href ? "pointer" : "grab";
    s.input.up(e);
  }

  function onHitLeave() {
    showTip(null);
    if (drag || !hovered) return;
    hovered.input.hover(null);
    hovered = null;
  }

  // While carrying: a click (or a finger lifting) sticks it down.
  carryLayer.addEventListener("pointerdown", (e) => {
    if (!carried || e.button > 0 || e.pointerType === "touch") return;
    e.preventDefault();
    carried.stick(false);
  });
  carryLayer.addEventListener("contextmenu", (e) => e.preventDefault());

  function onWindowDown(e) {
    if (e.pointerType === "touch") fingers.add(e.pointerId);
  }

  function onWindowUp(e) {
    fingers.delete(e.pointerId);
    if (carried && e.pointerType === "touch" && carried.carriedByTouch()) carried.stick(true);
  }

  function onWindowMove(e) {
    if (e.pointerType === "touch" && !opts.touch) return;
    board.cursor = { x: e.clientX, y: e.clientY };
    board.lastMove = performance.now();
    const t = board.trail;
    t.push({ t: e.timeStamp, x: e.clientX, y: e.clientY });
    while (t.length > 2 && e.timeStamp - t[0].t > 70) t.shift();
    // Trying to shake it off? It falls.
    if (carried) {
      const k = carried.config.carry;
      if (e.timeStamp - carried.carriedSince() > k.flip + 150 && board.trailSpeed(e.timeStamp) > k.shakeOff) {
        carried.shakeOff();
      }
    }
    if (!armed && opts.appear === "first-move") arm();
    stickers.forEach((s) => s.onCursorMove());
  }

  function onKey(e) {
    if (e.key === "Escape" && carried) carried.shakeOff();
  }

  function eligible() {
    return window.innerWidth >= opts.minWidth && (board.env.fine || opts.touch);
  }

  function onResize() {
    board.env.dpr = Math.min(opts.maxDpr, window.devicePixelRatio || 1);
    host.hidden = !eligible();
    stickers.forEach((s) => s.onResize());
  }

  const onMedia = () => {
    board.env.reduced = reduced.matches;
    board.env.fine = fine.matches;
    onResize();
  };

  // Stickers come in once someone's here: on the first cursor move (or a
  // touch screen's first scroll), or right away.
  function arm() {
    if (armed) return;
    armed = true;
    window.removeEventListener("scroll", arm);
    stickers.forEach(enterWhenReady);
  }

  function enterWhenReady(s) {
    s.ready.then(() => {
      const { delay } = s.config.entrance;
      if (delay > 0) setTimeout(() => s.enter(), delay);
      else s.enter();
    });
  }

  window.addEventListener("pointermove", onWindowMove, { passive: true });
  window.addEventListener("pointerdown", onWindowDown, { capture: true, passive: true });
  window.addEventListener("pointerup", onWindowUp);
  window.addEventListener("pointercancel", onWindowUp);
  window.addEventListener("resize", onResize);
  window.addEventListener("keydown", onKey);
  fine.addEventListener?.("change", onMedia);
  reduced.addEventListener?.("change", onMedia);
  if (opts.appear === "load") queueMicrotask(arm);
  else if (opts.appear === "first-move" && !board.env.fine) window.addEventListener("scroll", arm, { passive: true });
  host.hidden = !eligible();

  return {
    root,
    stickers,
    // Adds a sticker (see DEFAULTS for options) and returns it.
    add(config) {
      const s = createSticker(board, merge(DEFAULTS, config));
      stickers.push(s);
      // Start downloading now, in parallel; the pixels are built in turn below.
      loadImage(config.src).catch(() => null);
      order += 1;
      const z = order;
      // Pixels are built one sticker at a time, yielding in between so the
      // page stays responsive.
      s.ready = queue = queue
        .then(yieldToBrowser)
        .then(() => s.prepare())
        .then(() => {
          s.setZ(Z_STICKER + z);
          return s;
        })
        .catch((err) => {
          console.warn("[sticker]", config.src, err);
          return s;
        });
      if (armed) enterWhenReady(s);
      return s;
    },
    // Brings the stickers in (for appear: "manual"), each once it's built.
    // Resolves when they're all in.
    show() {
      arm();
      return Promise.all(stickers.map((s) => s.ready));
    },
    // Every sticker fresh, back where it started.
    reset() {
      stickers.forEach(enterWhenReady);
      armed = true;
    },
    // The trash can on its own, for tuning.
    previewTrash() {
      board.catch(window.innerWidth / 2, 700, 1);
    },
    destroy() {
      window.removeEventListener("pointermove", onWindowMove);
      window.removeEventListener("pointerdown", onWindowDown, { capture: true });
      window.removeEventListener("pointerup", onWindowUp);
      window.removeEventListener("pointercancel", onWindowUp);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", arm);
      fine.removeEventListener?.("change", onMedia);
      reduced.removeEventListener?.("change", onMedia);
      stopCatch?.();
      stickers.forEach((s) => s.destroy());
      host.remove();
    },
  };
}
