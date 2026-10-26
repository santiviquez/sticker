import { rotate } from "./motion.js";

const SIDES = ["left", "right"];

// Googly eyes stuck over the face. Positions come from config as fractions of
// the image square; pupils are moved imperatively by `Googly`. Appends the
// eyes to `parent` and returns the eye and pupil elements.
export function buildEyes(parent, eyes, size) {
  const r = eyes.size * size;
  const pr = r * eyes.pupil;
  const eyeEls = [];
  const pupilEls = [];
  SIDES.forEach((side) => {
    const eye = document.createElement("div");
    eye.className = "eye";
    Object.assign(eye.style, {
      left: `${eyes[side].x * size - r}px`,
      top: `${eyes[side].y * size - r}px`,
      width: `${2 * r}px`,
      height: `${2 * r}px`,
    });
    eye.style.setProperty("--white", eyes.white);
    eye.style.setProperty("--outline", `${eyes.outline}px`);
    const pupil = document.createElement("div");
    pupil.className = "pupil";
    Object.assign(pupil.style, {
      left: `${r - pr}px`,
      top: `${r - pr}px`,
      width: `${2 * pr}px`,
      height: `${2 * pr}px`,
      background: eyes.pupilColor,
    });
    const glint = document.createElement("div");
    glint.className = "glint";
    eye.append(pupil, glint);
    parent.append(eye);
    eyeEls.push(eye);
    pupilEls.push(pupil);
  });
  return { eyeEls, pupilEls };
}

// How far a pupil can travel from the centre of its eye.
export function pupilTravel(eyes, size) {
  const r = eyes.size * size;
  return Math.max(0, r - r * eyes.pupil - eyes.outline * 0.5) * eyes.reach;
}

// Spring-driven pupils. Low damping is the point: they overshoot, rattle off
// the rim and jiggle when the sticker moves, like the real plastic ones.
export class Googly {
  constructor() {
    this.p = [
      { x: 0, y: 0, vx: 0, vy: 0 },
      { x: 0, y: 0, vx: 0, vy: 0 },
    ];
    this.scale = 1;
    this.scaleTarget = 1;
    this.moving = false;
  }

  // Aim each pupil at a screen point. `centers` are the eyes' screen centres,
  // `tilt` the sticker rotation (rad), `pointer` null when idle.
  aim(centers, pointer, tilt, travel, falloff) {
    return centers.map((c) => {
      if (!pointer) {
        // Nobody's around: pupils drop to the bottom, the way googly eyes do.
        return rotate(0, travel, -tilt);
      }
      const d = rotate(pointer.x - c.x, pointer.y - c.y, -tilt);
      const dist = Math.hypot(d.x, d.y) || 1;
      const reach = travel * (1 - Math.exp(-dist / falloff));
      return { x: (d.x / dist) * reach, y: (d.y / dist) * reach };
    });
  }

  step(dt, targets, eyes, travel, damped) {
    const k = eyes.stiffness;
    const c = damped ? 2 * Math.sqrt(k) : eyes.damping;
    let moving = false;
    let left = Math.min(dt, 64) / 1000;
    while (left > 0) {
      const h = Math.min(left, 0.004);
      left -= h;
      this.p.forEach((p, i) => {
        const t = targets[i];
        p.vx += (-k * (p.x - t.x) - c * p.vx) * h;
        p.vy += (-k * (p.y - t.y) - c * p.vy) * h;
        p.x += p.vx * h;
        p.y += p.vy * h;
        const d = Math.hypot(p.x, p.y);
        if (d > travel && d > 0) {
          const nx = p.x / d;
          const ny = p.y / d;
          p.x = nx * travel;
          p.y = ny * travel;
          const vn = p.vx * nx + p.vy * ny;
          if (vn > 0) {
            // bounce off the rim
            p.vx -= 1.35 * vn * nx;
            p.vy -= 1.35 * vn * ny;
          }
        }
      });
    }
    this.scale += (this.scaleTarget - this.scale) * Math.min(1, dt / 90);
    this.p.forEach((p, i) => {
      const t = targets[i];
      if (Math.abs(p.vx) + Math.abs(p.vy) > 2 || Math.abs(p.x - t.x) + Math.abs(p.y - t.y) > 0.05) {
        moving = true;
      }
    });
    if (Math.abs(this.scale - this.scaleTarget) > 0.005) moving = true;
    this.moving = moving;
    return moving;
  }

  // A jolt, e.g. when the sticker lands or snaps back.
  kick(strength = 1) {
    this.p.forEach((p) => {
      const a = Math.random() * Math.PI * 2;
      p.vx += Math.cos(a) * 90 * strength;
      p.vy += (Math.sin(a) * 50 - 120) * strength;
    });
    this.moving = true;
  }

  // Inertia: when the sticker accelerates (px/s², in its own frame), the
  // pupils get left behind.
  push(ax, ay, dt) {
    const h = Math.min(dt, 64) / 1000;
    this.p.forEach((p) => {
      p.vx -= ax * 0.09 * h;
      p.vy -= ay * 0.09 * h;
    });
  }

  reset() {
    this.p.forEach((p) => Object.assign(p, { x: 0, y: 0, vx: 0, vy: 0 }));
  }

  apply(pupils) {
    this.p.forEach((p, i) => {
      const el = pupils[i];
      if (el) el.style.transform = `translate(${p.x.toFixed(2)}px, ${p.y.toFixed(2)}px) scale(${this.scale.toFixed(3)})`;
    });
  }
}

// Close-and-open on the eye elements. `hold` stretches the closed part (winks).
export function blink(els, hold = 0) {
  const duration = 150 + hold;
  const shut = Math.min(0.42, 60 / duration);
  els.forEach((el) => {
    if (!el) return;
    el.animate(
      [
        { transform: "scaleY(1)" },
        { transform: "scaleY(0.08)", offset: shut },
        { transform: "scaleY(0.08)", offset: 1 - (90 / duration) },
        { transform: "scaleY(1)" },
      ],
      { duration, easing: "ease-in-out" }
    );
  });
}
