// The lab: tune a sticker live, place its eyes on a big preview, and copy the
// settings. Only load it while you're setting things up; visitors never need it.

import { buildArt } from "./art.js";
import { buildEyes, Googly, pupilTravel } from "./eyes.js";
import { DEFAULTS, EYES, merge } from "./sticker.js";

const range = (path, label, min, max, step, unit = "") => ({ type: "range", path, label, min, max, step, unit });
const choice = (path, label, options) => ({ type: "choice", path, label, options });
const toggle = (path, label) => ({ type: "toggle", path, label });
const color = (path, label) => ({ type: "color", path, label });

const GROUPS = [
  {
    title: "placement",
    fields: [range("size", "size", 48, 280, 1, "px"), range("tilt", "tilt", -40, 40, 0.5, "°")],
  },
  {
    title: "look",
    fields: [
      choice("look.filter", "photo", ["color", "mono", "ink"]),
      range("look.border", "border", 0, 16, 0.5, "px"),
      range("look.smoothing", "cut smoothing", 0, 0.16, 0.005),
      color("look.borderColor", "border color"),
      range("look.shadow", "shadow", 0, 0.6, 0.01),
      range("look.gloss", "gloss", 0, 1, 0.01),
    ],
  },
  {
    title: "entrance",
    replays: true,
    fields: [
      choice("entrance.style", "style", ["slap", "pop", "peek"]),
      range("entrance.delay", "delay", 0, 3000, 10, "ms"),
      range("entrance.duration", "duration", 120, 1600, 10, "ms"),
      range("entrance.bounce", "bounce", 0, 0.8, 0.01),
      range("entrance.fromScale", "from scale", 0.3, 2.6, 0.01, "×"),
      range("entrance.fromRotate", "from rotate", -120, 120, 1, "°"),
      range("entrance.fromLift", "lift", 0, 100, 1, "px"),
      range("entrance.blur", "blur", 0, 16, 0.5, "px"),
    ],
  },
  {
    title: "eyes",
    note: "drag them on the big preview to move, the dot on the rim to resize",
    eyes: true,
    fields: [
      range("eyes.size", "size", 0.02, 0.14, 0.001),
      range("eyes.pupil", "pupil", 0.2, 0.9, 0.01),
      range("eyes.reach", "reach", 0, 1, 0.01),
      range("eyes.outline", "outline", 0, 3, 0.1, "px"),
      color("eyes.white", "white"),
      color("eyes.pupilColor", "pupil color"),
      range("eyes.stiffness", "stiffness", 30, 1400, 5),
      range("eyes.damping", "damping", 0.5, 70, 0.5),
      range("eyes.idleAfter", "fall asleep after", 500, 20000, 100, "ms"),
      range("eyes.blinkMin", "blink min", 300, 15000, 100, "ms"),
      range("eyes.blinkMax", "blink max", 300, 20000, 100, "ms"),
      toggle("eyes.winkOnClick", "wink on click"),
    ],
  },
  {
    title: "peel",
    note: "peel the real one to try these",
    fields: [
      range("peel.ripAt", "rips past", 0.05, 1, 0.01),
      range("peel.flick", "flick speed", 0.2, 4, 0.05, "px/ms"),
      range("peel.hoverLift", "hover lift", 0, 30, 0.5, "px"),
      color("peel.backColor", "paper back"),
      range("peel.curl", "curl shading", 0, 1.6, 0.01),
      range("peel.flapShadow", "flap shadow", 0, 0.8, 0.01),
      range("peel.gravity", "gravity", 0, 0.012, 0.0001),
      range("peel.spin", "spin", -1.5, 1.5, 0.01, "°/ms"),
      range("peel.flipSpeed", "flip", 0, 2, 0.01, "°/ms"),
    ],
  },
  {
    title: "carry",
    note: "after a full peel it rides the cursor; click to stick it down",
    fields: [
      range("carry.lift", "lifted scale", 1, 1.3, 0.01, "×"),
      range("carry.flip", "flip over", 0, 1000, 10, "ms"),
      range("carry.stiffness", "paper stiffness", 0, 200, 1),
      range("carry.droop", "droop", 0, 8000, 50),
      range("carry.sway", "sway", 0, 3, 0.05),
      range("carry.damping", "damping", 0, 20, 0.1),
      range("carry.shakeOff", "shake off at", 1, 10, 0.1, "px/ms"),
    ],
  },
  {
    title: "glue",
    note: "every re-stick adds dust and loses grip; the last one fails",
    fields: [
      range("glue.uses", "sticks", 1, 12, 1),
      range("glue.restCurl", "worn curl", 0, 50, 0.5, "px"),
      range("glue.dust", "dust", 0, 3, 0.05, "×"),
      range("glue.failHold", "last one holds", 0, 4000, 50, "ms"),
    ],
  },
];

// Changing these rebuilds the pixels, so they wait for the slider to settle.
const PIXELS = ["size", "look.filter", "look.border", "look.smoothing", "look.borderColor", "peel.backColor"];

const getPath = (obj, path) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
function setPath(obj, path, value) {
  const [k, ...rest] = path.split(".");
  return { ...obj, [k]: rest.length ? setPath(obj?.[k] || {}, rest.join("."), value) : value };
}
const decimals = (step) => (String(step).includes(".") ? String(step).split(".")[1].length : 0);

function h(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v === true ? "" : v);
  }
  e.append(...children.filter((c) => c != null));
  return e;
}

// Only what differs from the defaults, so the snippet stays short.
function diff(cfg, base) {
  const out = {};
  for (const k of Object.keys(cfg)) {
    const a = cfg[k];
    const b = base?.[k];
    if (a && typeof a === "object" && b && typeof b === "object") {
      const d = diff(a, b);
      if (Object.keys(d).length) out[k] = d;
    } else if (a !== b) out[k] = a;
  }
  return out;
}

export function mountLab({ panel, stage, board, sticker }) {
  let cfg = sticker.config;
  if (cfg.eyes) cfg = { ...cfg, eyes: merge(EYES, cfg.eyes) };
  const fields = [];
  let pixelTimer = 0;
  let replayTimer = 0;
  const status = h("p", { class: "status", "aria-live": "polite" });
  const flash = (msg) => {
    status.textContent = msg;
    setTimeout(() => {
      if (status.textContent === msg) status.textContent = "";
    }, 2400);
  };

  function apply(path, value, replays) {
    cfg = setPath(cfg, path, value);
    // Always the whole lab state, so quick successive edits can't drop one.
    clearTimeout(pixelTimer);
    if (PIXELS.includes(path)) pixelTimer = setTimeout(() => sticker.update(cfg).then(drawStage), 160);
    else sticker.update(cfg);
    if (path.startsWith("eyes")) drawEyes();
    if (replays) {
      clearTimeout(replayTimer);
      replayTimer = setTimeout(() => sticker.enter(), 450);
    }
    sync();
  }

  function field(f, replays) {
    const value = () => getPath(cfg, f.path);
    let row;
    let refresh;
    if (f.type === "range") {
      const input = h("input", { class: "range", type: "range", min: f.min, max: f.max, step: f.step });
      const out = h("span", { class: "value" });
      input.addEventListener("input", () => apply(f.path, Number(input.value), replays));
      refresh = () => {
        const v = value();
        input.value = v;
        input.style.setProperty("--p", `${Math.min(100, Math.max(0, ((v - f.min) / (f.max - f.min)) * 100))}%`);
        out.textContent = Number(v).toFixed(decimals(f.step));
        out.append(h("span", { class: "unit" }, f.unit));
      };
      row = h("label", { class: "row" }, h("span", { class: "label" }, f.label), input, out);
    } else if (f.type === "choice") {
      const buttons = f.options.map((o) =>
        h("button", { type: "button", role: "radio", class: "option", onclick: () => apply(f.path, o, replays) }, o)
      );
      refresh = () => buttons.forEach((b, i) => b.setAttribute("aria-checked", value() === f.options[i]));
      row = h(
        "div",
        { class: "row" },
        h("span", { class: "label" }, f.label),
        h("div", { class: "choice", role: "radiogroup", "aria-label": f.label }, ...buttons)
      );
    } else if (f.type === "toggle") {
      const sw = h("button", { type: "button", role: "switch", class: "switch", "aria-label": f.label });
      sw.addEventListener("click", () => apply(f.path, !value(), replays));
      refresh = () => sw.setAttribute("aria-checked", !!value());
      row = h("div", { class: "row" }, h("span", { class: "label" }, f.label), sw);
    } else {
      const input = h("input", { type: "color" });
      const out = h("span", { class: "value" });
      input.addEventListener("input", () => apply(f.path, input.value, replays));
      refresh = () => {
        input.value = value();
        out.textContent = value();
      };
      row = h("label", { class: "row" }, h("span", { class: "label" }, f.label), h("span", { class: "well" }, input), out);
    }
    fields.push(refresh);
    return row;
  }

  // ---- panel ----
  const file = h("input", { type: "file", accept: "image/*", hidden: true });
  file.addEventListener("change", () => {
    const f = file.files?.[0];
    if (!f) return;
    // Stays in this browser: an object URL, never uploaded anywhere.
    const src = URL.createObjectURL(f);
    cfg = { ...cfg, src };
    sticker.update({ src }).then(() => {
      drawStage();
      sticker.enter();
    });
    flash(`using ${f.name}`);
  });

  const eyesSwitch = h("button", { type: "button", role: "switch", class: "switch", "aria-label": "googly eyes" });
  eyesSwitch.addEventListener("click", () => {
    const on = !cfg.eyes;
    const eyes = on ? merge(EYES, { left: { x: 0.4, y: 0.36 }, right: { x: 0.6, y: 0.36 } }) : false;
    cfg = { ...cfg, eyes };
    sticker.update({ eyes });
    drawEyes();
    sync();
  });

  const copy = async () => {
    const out = diff(cfg, DEFAULTS);
    if (String(cfg.src).startsWith("blob:")) out.src = "/your-image.webp";
    else out.src = cfg.src;
    if (cfg.eyes) out.eyes = { left: cfg.eyes.left, right: cfg.eyes.right, ...diff(cfg.eyes, { ...EYES, left: cfg.eyes.left, right: cfg.eyes.right }) };
    delete out.under;
    const text = `board.add(${JSON.stringify(out, null, 2)});`;
    await navigator.clipboard.writeText(text);
    flash("copied board.add(…) to the clipboard");
  };

  const header = h(
    "header",
    { class: "header" },
    h("h1", { class: "title" }, "sticker lab"),
    h(
      "div",
      { class: "actions" },
      h("button", { type: "button", class: "button", onclick: () => file.click() }, "your image"),
      h("button", { type: "button", class: "button", onclick: () => sticker.enter() }, "replay"),
      h("button", { type: "button", class: "button", onclick: () => board.previewTrash() }, "trash can"),
      h("button", { type: "button", class: "button", "data-primary": "true", onclick: copy }, "copy settings")
    ),
    status,
    file
  );
  panel.append(header);
  for (const g of GROUPS) {
    const section = h("section", { class: "group" }, h("h2", { class: "group-title" }, g.title));
    if (g.note) section.append(h("p", { class: "group-note" }, g.note));
    if (g.eyes) section.append(h("div", { class: "row" }, h("span", { class: "label" }, "googly eyes"), eyesSwitch));
    const rows = h("div", {});
    g.fields.forEach((f) => rows.append(field(f, g.replays)));
    section.append(rows);
    panel.append(section);
    if (g.eyes) panel.eyesRows = rows;
  }

  function sync() {
    eyesSwitch.setAttribute("aria-checked", !!cfg.eyes);
    if (panel.eyesRows) panel.eyesRows.hidden = !cfg.eyes;
    fields.forEach((r) => r());
  }

  // ---- big preview with eye handles ----
  const P = 420;
  const box = h("div", { class: "stage-box", style: `width:${P}px;height:${P}px` });
  const img = h("img", { class: "stage-art", alt: "" });
  const eyesLayer = h("div", { class: "stage-eyes" });
  box.append(img, eyesLayer);
  stage.append(box, h("p", { class: "stage-note" }, "the real one is in the corner. peel it."));
  const googly = new Googly();
  let pupils = [];

  async function drawStage() {
    const art = await buildArt({
      src: cfg.src,
      size: P,
      dpr: Math.min(2, window.devicePixelRatio || 1),
      // Border is in px at the sticker's size; scale it so the preview matches.
      border: (cfg.look.border * P) / cfg.size,
      smoothing: cfg.look.smoothing,
      borderColor: cfg.look.borderColor,
      backColor: cfg.peel.backColor,
      filter: cfg.look.filter,
    });
    art.urls.then(({ front }) => (img.src = front));
    const { box } = art;
    Object.assign(img.style, { left: `${box.x}px`, top: `${box.y}px`, width: `${box.w}px`, height: `${box.h}px` });
  }

  function drag(kind) {
    return {
      onpointerdown(e) {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
      },
      onpointermove(e) {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
        const r = box.getBoundingClientRect();
        const x = (e.clientX - r.left) / P;
        const y = (e.clientY - r.top) / P;
        const round = (n) => Math.round(n * 1000) / 1000;
        if (kind === "size") {
          const c = cfg.eyes.right;
          apply("eyes.size", round(Math.min(0.14, Math.max(0.02, Math.hypot(x - c.x, y - c.y)))));
        } else {
          apply(`eyes.${kind}`, { x: round(x), y: round(y) });
        }
      },
    };
  }

  function drawEyes() {
    eyesLayer.replaceChildren();
    pupils = [];
    if (!cfg.eyes) return;
    const eyes = merge(EYES, cfg.eyes);
    pupils = buildEyes(eyesLayer, eyes, P).pupilEls;
    const r = eyes.size * P;
    for (const side of ["left", "right"]) {
      const handle = h("div", {
        class: "handle",
        "aria-label": `move ${side} eye`,
        style: `left:${eyes[side].x * P - r - 6}px;top:${eyes[side].y * P - r - 6}px;width:${2 * r + 12}px;height:${2 * r + 12}px`,
      });
      const d = drag(side);
      handle.addEventListener("pointerdown", d.onpointerdown);
      handle.addEventListener("pointermove", d.onpointermove);
      eyesLayer.append(handle);
    }
    const knob = h("div", {
      class: "knob",
      "aria-label": "resize eyes",
      style: `left:${eyes.right.x * P + r}px;top:${eyes.right.y * P}px`,
    });
    const d = drag("size");
    knob.addEventListener("pointerdown", d.onpointerdown);
    knob.addEventListener("pointermove", d.onpointermove);
    eyesLayer.append(knob);
  }

  let cursor = null;
  let lastMove = 0;
  window.addEventListener("pointermove", (e) => {
    cursor = { x: e.clientX, y: e.clientY };
    lastMove = performance.now();
  });
  let last = performance.now();
  const loop = (now) => {
    const dt = now - last;
    last = now;
    if (cfg.eyes && pupils.length) {
      const eyes = merge(EYES, cfg.eyes);
      const r = box.getBoundingClientRect();
      const centers = [eyes.left, eyes.right].map((e) => ({ x: r.left + e.x * P, y: r.top + e.y * P }));
      const travel = pupilTravel(eyes, P);
      const idle = !cursor || now - lastMove > eyes.idleAfter;
      googly.step(dt, googly.aim(centers, idle ? null : cursor, 0, travel, P * 0.45), eyes, travel, false);
      googly.apply(pupils);
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  drawStage();
  drawEyes();
  sync();
}
