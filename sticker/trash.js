import { EASE_OUT, springEasing } from "./motion.js";

// An old galvanized trash can that pops up from the bottom of the screen to
// catch a sticker someone got rid of. It's three fixed layers so the sticker
// can fall *into* it: the inside and back rim under the sticker, the body and
// front rim over it, and the lid, which swaps between the two.

// Stacking inside the board: falling stickers fly between BACK and FRONT.
export const Z = { back: 5000, falling: 5001, front: 5002, lid: 5003 };

const VW = 160;
const VH = 200;
const RIM_Y = 24;

// The body tapers: half-width and ellipse depth at height y.
const hw = (y) => 71 - (8 * (y - RIM_Y)) / 164;
const dep = (y) => 11 - (2 * (y - RIM_Y)) / 164;
const f = (n) => +n.toFixed(2);

const arc = (y) => `M${f(80 - hw(y))},${y} A${f(hw(y))},${f(dep(y))} 0 0 0 ${f(80 + hw(y))},${y}`;
const band = (y1, y2) =>
  `${arc(y1)} L${f(80 + hw(y2))},${y2} A${f(hw(y2))},${f(dep(y2))} 0 0 1 ${f(80 - hw(y2))},${y2} Z`;

const BODY = "M9,24 A71,11 0 0 0 151,24 L143,188 A63,9 0 0 1 17,188 Z";
const LIP_FRONT = "M6,24 A74,12 0 0 0 154,24 L149,24 A69,9.5 0 0 1 11,24 Z";
const LIP_BACK = "M6,24 A74,12 0 0 1 154,24 L149,24 A69,9.5 0 0 0 11,24 Z";

// Turbulence turned into an alpha mask for whatever it's applied to.
const noise = (id, freq, octaves, seed, gain, bias) => `
  <filter id="${id}" x="0" y="0" width="1" height="1">
    <feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="${octaves}" seed="${seed}" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  ${gain} 0 0 0 ${bias}" result="a"/>
    <feComposite in="SourceGraphic" in2="a" operator="in"/>
  </filter>`;

// Galvanized steel round a cylinder, lit from the upper left.
const METAL = [
  [0, "#4c5055"],
  [0.06, "#777c82"],
  [0.2, "#afb4b8"],
  [0.33, "#dadde0"],
  [0.4, "#eceeef"],
  [0.48, "#c6cacd"],
  [0.62, "#a1a6aa"],
  [0.8, "#858a8f"],
  [0.94, "#686d72"],
  [1, "#4a4e53"],
];
const metal = (id, x1, x2) =>
  `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${x1}" y1="0" x2="${x2}" y2="0">${METAL.map(
    ([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`
  ).join("")}</linearGradient>`;

function ribs() {
  const N = 22;
  let out = "";
  for (let i = 0; i < N; i++) {
    const th = -Math.PI / 2 + ((i + 0.5) * Math.PI) / N;
    const sin = Math.sin(th);
    const cos = Math.cos(th);
    const y1 = 44;
    const y2 = 164;
    const xt = 80 + hw(y1) * sin;
    const xb = 80 + hw(y2) * sin;
    const yt = y1 + dep(y1) * cos;
    const yb = y2 + dep(y2) * cos;
    const w = 2.5 * cos + 0.35;
    out += `<path d="M${f(xt - w)},${f(yt)} L${f(xb - w * 0.9)},${f(yb)} L${f(xb)},${f(yb)} L${f(xt)},${f(yt)} Z" fill="#fff" opacity="${f(0.08 + 0.3 * cos)}"/>`;
    out += `<path d="M${f(xt)},${f(yt)} L${f(xb)},${f(yb)} L${f(xb + w * 0.9)},${f(yb)} L${f(xt + w)},${f(yt)} Z" fill="#000" opacity="${f(0.07 + 0.13 * cos)}"/>`;
  }
  return out;
}

const raisedBand = (y1, y2, id) => `
  <path d="${band(y1, y2)}" fill="url(#${id}-metal)"/>
  <path d="${arc(y1)}" fill="none" stroke="#fff" stroke-opacity="0.6" stroke-width="0.8"/>
  <path d="${arc(y2)}" fill="none" stroke="#000" stroke-opacity="0.28" stroke-width="1.1"/>`;

function canFront() {
  const id = "st-can-f";
  return `<svg viewBox="0 0 ${VW} ${VH}" width="100%" height="100%" overflow="visible">
  <defs>
    ${metal(`${id}-metal`, 9, 151)}
    <linearGradient id="${id}-shine" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.38"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="${id}-fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.25" stop-color="#fff" stop-opacity="1"/><stop offset="0.75" stop-color="#fff" stop-opacity="1"/><stop offset="1" stop-color="#fff" stop-opacity="0.35"/>
    </linearGradient>
    <linearGradient id="${id}-foot" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.4" stop-color="#fff" stop-opacity="1"/>
    </linearGradient>
    <linearGradient id="${id}-ao" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#000" stop-opacity="0.22"/><stop offset="1" stop-color="#000" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="${id}-bracket" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#a9aeb2"/><stop offset="1" stop-color="#64696e"/>
    </linearGradient>
    <mask id="${id}-band" maskContentUnits="userSpaceOnUse"><rect x="0" y="84" width="${VW}" height="86" fill="url(#${id}-fade)"/></mask>
    <mask id="${id}-base" maskContentUnits="userSpaceOnUse"><rect x="0" y="156" width="${VW}" height="44" fill="url(#${id}-foot)"/></mask>
    <clipPath id="${id}-clip"><path d="${BODY}"/></clipPath>
    ${noise(`${id}-mottle`, "0.55", 2, 4, 2, -0.9)}
    ${noise(`${id}-stain`, "0.014 0.06", 3, 5, 2.2, -0.55)}
    ${noise(`${id}-rust`, "0.06 0.11", 4, 7, 3.8, -1.95)}
    ${noise(`${id}-pits`, "0.1 0.18", 4, 19, 4.4, -2.45)}
    ${noise(`${id}-streak`, "0.2 0.011", 3, 11, 2.8, -1.15)}
    ${noise(`${id}-foot-rust`, "0.08 0.14", 4, 23, 3, -0.85)}
    ${noise(`${id}-grime`, "0.035", 3, 31, 1.7, -0.6)}
    <filter id="${id}-soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="0.8"/></filter>
  </defs>
  <g clip-path="url(#${id}-clip)">
    <rect width="${VW}" height="${VH}" fill="url(#${id}-metal)"/>
    <rect width="${VW}" height="${VH}" fill="#fff" opacity="0.22" filter="url(#${id}-mottle)"/>
    ${ribs()}
    ${raisedBand(33, 41, id)}
    ${raisedBand(166, 174, id)}
    <path d="${band(41, 49)}" fill="url(#${id}-ao)"/>
    <path d="${arc(26.5)}" fill="none" stroke="#000" stroke-opacity="0.25" stroke-width="3" filter="url(#${id}-soft)"/>
    <g mask="url(#${id}-band)">
      <rect x="0" y="84" width="${VW}" height="86" fill="#7e6243" opacity="0.6" filter="url(#${id}-stain)"/>
      <rect x="0" y="84" width="${VW}" height="86" fill="#9a5f2c" opacity="0.55" filter="url(#${id}-rust)"/>
      <rect x="0" y="84" width="${VW}" height="86" fill="#55301a" opacity="0.6" filter="url(#${id}-pits)"/>
    </g>
    <rect x="0" y="46" width="${VW}" height="130" fill="#6d4526" opacity="0.32" filter="url(#${id}-streak)"/>
    <g mask="url(#${id}-base)">
      <rect x="0" y="156" width="${VW}" height="44" fill="#4e301b" opacity="0.88" filter="url(#${id}-foot-rust)"/>
    </g>
    <rect width="${VW}" height="${VH}" fill="#2f2a25" opacity="0.24" filter="url(#${id}-grime)"/>
    <rect x="48" y="0" width="20" height="${VH}" fill="url(#${id}-shine)"/>
    <rect x="138" y="0" width="6" height="${VH}" fill="#fff" opacity="0.08"/>
    <g transform="translate(96 84) scale(1.3) translate(-96 -84)">
      <path d="M88.5,91 C88.5,110 103.5,110 103.5,91" transform="translate(1.4 2.6)" fill="none" stroke="#000" stroke-opacity="0.28" stroke-width="2.6" filter="url(#${id}-soft)"/>
      <rect x="85.5" y="82" width="21" height="10.5" rx="2" fill="url(#${id}-bracket)" stroke="#45494d" stroke-width="0.6"/>
      <rect x="85.5" y="82" width="21" height="2" rx="1" fill="#fff" opacity="0.35"/>
      <circle cx="89.4" cy="87" r="1.35" fill="#50555a"/>
      <circle cx="102.6" cy="87" r="1.35" fill="#50555a"/>
      <circle cx="89" cy="86.6" r="0.45" fill="#fff" opacity="0.6"/>
      <circle cx="102.2" cy="86.6" r="0.45" fill="#fff" opacity="0.6"/>
      <path d="M88.5,91 C88.5,110 103.5,110 103.5,91" fill="none" stroke="#565b60" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M88.1,92 C88.1,109 103.1,109 103.1,92" fill="none" stroke="#d2d5d8" stroke-width="0.7" stroke-linecap="round" opacity="0.8"/>
      <path d="M95,106.5 C98,106.6 101,104 102.4,99" fill="none" stroke="#7a4a26" stroke-width="1.1" opacity="0.55"/>
    </g>
  </g>
  <path d="${BODY}" fill="none" stroke="#2c2f32" stroke-opacity="0.55" stroke-width="0.7"/>
  <path d="${LIP_FRONT}" fill="url(#${id}-metal)"/>
  <path d="${LIP_FRONT}" fill="#fff" opacity="0.18"/>
  <path d="M11,24 A69,9.5 0 0 0 149,24" fill="none" stroke="#fff" stroke-opacity="0.6" stroke-width="0.8"/>
  <path d="M6,24 A74,12 0 0 0 154,24" fill="none" stroke="#33363a" stroke-opacity="0.6" stroke-width="0.7"/>
</svg>`;
}

function canBack() {
  const id = "st-can-b";
  return `<svg viewBox="0 0 ${VW} ${VH}" width="100%" height="100%" overflow="visible">
  <defs>
    ${metal(`${id}-metal`, 6, 154)}
    <linearGradient id="${id}-inside" gradientUnits="userSpaceOnUse" x1="0" y1="14.5" x2="0" y2="33.5">
      <stop offset="0" stop-color="#8a8e93"/><stop offset="0.3" stop-color="#56585b"/><stop offset="0.65" stop-color="#262524"/><stop offset="1" stop-color="#121110"/>
    </linearGradient>
  </defs>
  <path d="${LIP_BACK}" fill="url(#${id}-metal)"/>
  <path d="M6,24 A74,12 0 0 1 154,24" fill="none" stroke="#fff" stroke-opacity="0.45" stroke-width="0.8"/>
  <ellipse cx="80" cy="${RIM_Y}" rx="69" ry="9.5" fill="url(#${id}-inside)"/>
  <path d="M11,24 A69,9.5 0 0 1 149,24" fill="none" stroke="#000" stroke-opacity="0.35" stroke-width="0.7"/>
</svg>`;
}

const DOME = "M7,39 C9,29 44,21 85,21 C126,21 161,29 163,39 A78,13 0 0 1 7,39 Z";
const SKIRT = "M7,39 L7,44 A78,13 0 0 0 163,44 L163,39 A78,13 0 0 1 7,39 Z";

function lid() {
  const id = "st-can-l";
  const rings = [
    [33, 60, 9.6],
    [28.5, 42, 6.8],
    [25, 24, 4.2],
  ];
  return `<svg viewBox="0 0 170 64" width="100%" height="100%" overflow="visible">
  <defs>
    ${metal(`${id}-metal`, 7, 163)}
    <radialGradient id="${id}-sheen" cx="0.36" cy="0.2" r="0.6">
      <stop offset="0" stop-color="#fff" stop-opacity="0.5"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="${id}-clip"><path d="${DOME}"/></clipPath>
    ${noise(`${id}-rust`, "0.09", 4, 41, 3.6, -1.75)}
    ${noise(`${id}-grime`, "0.05", 3, 43, 1.6, -0.55)}
    <filter id="${id}-soft" x="-30%" y="-100%" width="160%" height="300%"><feGaussianBlur stdDeviation="0.9"/></filter>
  </defs>
  <path d="${SKIRT}" fill="url(#${id}-metal)"/>
  <path d="${SKIRT}" fill="#000" opacity="0.18"/>
  <path d="M7,44 A78,13 0 0 0 163,44" fill="none" stroke="#2f3236" stroke-opacity="0.6" stroke-width="0.7"/>
  <path d="${DOME}" fill="url(#${id}-metal)"/>
  <g clip-path="url(#${id}-clip)">
    <rect width="170" height="64" fill="url(#${id}-sheen)"/>
    ${rings
      .map(
        ([cy, rx, ry]) =>
          `<ellipse cx="85" cy="${cy + 1.1}" rx="${rx}" ry="${ry}" fill="none" stroke="#000" stroke-opacity="0.16" stroke-width="0.9"/>` +
          `<ellipse cx="85" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="#fff" stroke-opacity="0.5" stroke-width="0.9"/>`
      )
      .join("")}
    <rect width="170" height="64" fill="#8d5a2c" opacity="0.45" filter="url(#${id}-rust)"/>
    <rect width="170" height="64" fill="#2f2a25" opacity="0.22" filter="url(#${id}-grime)"/>
    <ellipse cx="86.5" cy="24.4" rx="10.5" ry="2" fill="#000" opacity="0.22" filter="url(#${id}-soft)"/>
  </g>
  <path d="M7,39 A78,13 0 0 0 163,39" fill="none" stroke="#fff" stroke-opacity="0.4" stroke-width="0.7"/>
  <rect x="75" y="21.5" width="2.6" height="3.2" rx="0.6" fill="#55595e"/>
  <rect x="92.8" y="21.5" width="2.6" height="3.2" rx="0.6" fill="#55595e"/>
  <path d="M76.3,23 C76.3,12.5 94.1,12.5 94.1,23" fill="none" stroke="#5c6166" stroke-width="2.7" stroke-linecap="round"/>
  <path d="M76,22 C76,13.4 93.6,13.4 93.6,22" fill="none" stroke="#d6d9db" stroke-width="0.7" stroke-linecap="round"/>
</svg>`;
}

const wrap = (inner) =>
  `<div data-rise class="can-part"><div data-wobble class="can-part"><div data-squash class="can-part">${inner}</div></div></div>`;

const PUFFS = 9;

// Builds the three layers into `parent` (hidden until a catch).
export function buildTrashCan(parent, size) {
  const s = size / VW;
  const layer = (z, inner) => {
    const el = document.createElement("div");
    el.className = "can";
    el.setAttribute("aria-hidden", "true");
    Object.assign(el.style, { width: `${size}px`, height: `${VH * s}px`, zIndex: z });
    el.innerHTML = wrap(inner);
    parent.append(el);
    return el;
  };
  const puffs = Array.from(
    { length: PUFFS },
    () => `<span data-puff class="puff" style="top:${((RIM_Y + 1) / VH) * 100}%"></span>`
  ).join("");
  const lidBox = `left:${-5 * s}px;top:${(RIM_Y - 44 + 1) * s}px;width:${170 * s}px;height:${64 * s}px`;
  return {
    size,
    back: layer(Z.back, canBack()),
    front: layer(Z.front, canFront() + puffs),
    lid: layer(Z.lid, `<div data-lid class="lid" style="${lidBox}">${lid()}</div>`),
  };
}

// Where a falling sticker should aim: just inside the rim.
export function canMouth(size) {
  const s = size / VW;
  return { y: window.innerHeight + 6 - VH * s + (RIM_Y + 8) * s, half: size / 2 };
}

// Rise, lean toward the incoming sticker, pop the lid, gulp it down at `T` ms,
// slam the lid with a puff of dust, then sink away. `side` is -1 or 1: the
// side the sticker comes from. Returns a function that hides it early.
export function playCatch(can, { x, T, side }) {
  const { size } = can;
  const roots = [can.back, can.front, can.lid];
  const H = (VH * size) / VW;
  roots.forEach((r) => {
    r.getAnimations({ subtree: true }).forEach((a) => a.cancel());
    r.style.left = `${x - size / 2}px`;
    r.style.visibility = "visible";
  });

  const rise = springEasing(0.44, 0.3);
  const slam = T + 70;
  const impact = slam + 110;
  const sinkAt = impact + 750;
  const total = sinkAt + 560;
  const at = (ms) => Math.min(1, Math.max(0, ms / total));
  const parts = (name) => roots.map((r) => r.querySelector(`[data-${name}]`));
  const play = (els, frames) => els.map((el) => el.animate(frames, { duration: total, fill: "both" }));

  const [rising] = play(parts("rise"), [
    { offset: 0, transform: "translateY(115%)", easing: rise.easing },
    { offset: at(rise.duration), transform: "translateY(0%)" },
    { offset: at(sinkAt), transform: "translateY(0%)", easing: EASE_OUT },
    { offset: at(sinkAt + 150), transform: "translateY(-5%)", easing: "cubic-bezier(0.5, 0, 0.8, 0.3)" },
    { offset: 1, transform: "translateY(118%)" },
  ]);

  const lean = side * 4;
  play(parts("wobble"), [
    { offset: 0, transform: "rotate(0deg)", easing: "ease-in-out" },
    { offset: at(Math.max(rise.duration * 0.5, T - 260)), transform: `rotate(${lean}deg)` },
    { offset: at(T), transform: `rotate(${lean}deg)`, easing: EASE_OUT },
    { offset: at(T + 140), transform: "rotate(0deg)" },
    { offset: at(impact), transform: "rotate(0deg)", easing: "ease-out" },
    { offset: at(impact + 90), transform: `rotate(${-side * 3}deg)`, easing: "ease-in-out" },
    { offset: at(impact + 210), transform: `rotate(${side * 2}deg)`, easing: "ease-in-out" },
    { offset: at(impact + 330), transform: `rotate(${-side * 0.8}deg)`, easing: "ease-in-out" },
    { offset: at(impact + 440), transform: "rotate(0deg)" },
    { offset: 1, transform: "rotate(0deg)" },
  ]);

  // The gulp.
  play(parts("squash"), [
    { offset: 0, transform: "scale(1, 1)" },
    { offset: at(T), transform: "scale(1, 1)", easing: "ease-out" },
    { offset: at(T + 90), transform: "scale(1.06, 0.92)", easing: "ease-in-out" },
    { offset: at(T + 210), transform: "scale(0.97, 1.05)", easing: "ease-in-out" },
    { offset: at(T + 330), transform: "scale(1.01, 0.99)", easing: "ease-in-out" },
    { offset: at(T + 420), transform: "scale(1, 1)" },
    { offset: 1, transform: "scale(1, 1)" },
  ]);

  // The lid pops up and hovers behind the falling sticker, then slams down
  // with a clank-clank.
  const popAt = Math.max(rise.duration * 0.7, T - 330);
  const lift = H * 0.3;
  const dx = -side * size * 0.06;
  roots[2].querySelector("[data-lid]").animate(
    [
      { offset: 0, transform: "none" },
      { offset: at(popAt), transform: "none", easing: "cubic-bezier(0.2, 0.9, 0.3, 1.3)" },
      { offset: at(popAt + 240), transform: `translate(${dx}px, ${-lift}px) rotate(${-side * 16}deg)`, easing: "ease-in-out" },
      { offset: at(slam), transform: `translate(${dx}px, ${-lift * 1.08}px) rotate(${-side * 13}deg)`, easing: "cubic-bezier(0.55, 0, 0.9, 0.4)" },
      { offset: at(impact), transform: "none", easing: EASE_OUT },
      { offset: at(impact + 80), transform: `translateY(${-H * 0.045}px) rotate(${side * 4}deg)`, easing: "cubic-bezier(0.55, 0, 0.9, 0.4)" },
      { offset: at(impact + 160), transform: "none", easing: EASE_OUT },
      { offset: at(impact + 205), transform: `translateY(${-H * 0.015}px) rotate(${-side * 1.5}deg)`, easing: "ease-in" },
      { offset: at(impact + 250), transform: "none" },
      { offset: 1, transform: "none" },
    ],
    { duration: total, fill: "both" }
  );
  // Behind the sticker while it's up, on top of the rim once it's down.
  roots[2].animate(
    [
      { offset: 0, zIndex: Z.lid },
      { offset: at(popAt), zIndex: Z.lid },
      { offset: Math.min(1, at(popAt) + 0.0005), zIndex: Z.back },
      { offset: at(impact), zIndex: Z.back },
      { offset: Math.min(1, at(impact) + 0.0005), zIndex: Z.lid },
      { offset: 1, zIndex: Z.lid },
    ],
    { duration: total, fill: "both" }
  );

  const puffs = roots[1].querySelectorAll("[data-puff]");
  puffs.forEach((p, i) => {
    const u = (i / (puffs.length - 1)) * 2 - 1;
    const px = u * size * 0.24 + (Math.random() - 0.5) * 6;
    const py = -(6 + Math.random() * 10) * (1 - Math.abs(u) * 0.3);
    p.style.left = `${50 + u * 44}%`;
    p.animate(
      [
        { transform: "translate(-50%, -50%) scale(0.4)", opacity: 0 },
        {
          transform: `translate(calc(-50% + ${px * 0.5}px), calc(-50% + ${py * 0.6}px)) scale(1)`,
          opacity: 0.6,
          offset: 0.22,
        },
        { transform: `translate(calc(-50% + ${px}px), calc(-50% + ${py}px)) scale(1.8)`, opacity: 0 },
      ],
      { duration: 650 + Math.random() * 200, delay: impact, easing: EASE_OUT, fill: "both" }
    );
  });

  const hide = () =>
    roots.forEach((r) => {
      r.style.visibility = "hidden";
      r.getAnimations({ subtree: true }).forEach((a) => a.cancel());
    });
  rising.onfinish = hide;
  return hide;
}
