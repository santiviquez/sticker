// Strong ease-out for things entering or responding to the user.
export const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";

let linearSupported;
function supportsLinear() {
  if (linearSupported === undefined) {
    linearSupported =
      typeof CSS !== "undefined" &&
      CSS.supports("animation-timing-function", "linear(0, 0.5, 1)");
  }
  return linearSupported;
}

// Apple-style spring (perceptual duration + bounce) as a CSS `linear()` easing,
// so WAAPI can run a real spring off the main thread. Returns the time the
// spring actually takes to settle, which is longer than the perceptual duration.
export function springEasing(duration, bounce) {
  const w0 = (2 * Math.PI) / duration;
  const zeta = 1 - Math.min(0.9, Math.max(0, bounce));
  const wd = w0 * Math.sqrt(Math.max(0, 1 - zeta * zeta));
  const x = (t) =>
    zeta >= 1
      ? 1 - Math.exp(-w0 * t) * (1 + w0 * t)
      : 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
  const settle = Math.min(duration * 3, (Math.log(1 / 0.003) + (zeta >= 1 ? 2 : 0)) / (zeta * w0));
  if (!supportsLinear()) {
    return {
      easing: bounce > 0.05 ? "cubic-bezier(0.34, 1.4, 0.64, 1)" : EASE_OUT,
      duration: duration * 1000,
    };
  }
  const steps = 60;
  const points = [];
  for (let i = 0; i <= steps; i++) {
    points.push(i === steps ? 1 : +x((settle * i) / steps).toFixed(4));
  }
  return { easing: `linear(${points.join(", ")})`, duration: settle * 1000 };
}

// The rectangle `box` ([x0, y0, x1, y1]) cut down to the half-plane n·p <= c.
export function clipBox(nx, ny, c, box) {
  const pts = [
    [box[0], box[1]],
    [box[2], box[1]],
    [box[2], box[3]],
    [box[0], box[3]],
  ];
  const out = [];
  for (let i = 0; i < 4; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % 4];
    const da = nx * a[0] + ny * a[1] - c;
    const db = nx * b[0] + ny * b[1] - c;
    if (da <= 0) out.push(a);
    if (da <= 0 !== db <= 0) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

// Peel geometry for peel vector v (local px). The edge trailing behind the
// drag direction lifts and folds over toward it; the fold is the perpendicular
// bisector between that edge and where it's been pulled to, so it starts as a
// sliver and grows continuously in any direction.
//
// Points with d·p < c are lifted (and drawn reflected across the fold).
export function fold(v, art) {
  const len = Math.hypot(v.x, v.y);
  if (len < 0.25) return null;
  const dx = v.x / len;
  const dy = v.y / len;
  const center = art.size / 2;
  const trailing = art.support(-dx, -dy);
  const leading = art.support(dx, dy);
  const s = len / 2 - trailing; // fold position along d, from the centre
  return {
    dx,
    dy,
    len,
    c: s + (dx + dy) * center,
    // 0 = untouched, 1 = the fold has crossed the whole sticker
    progress: len / 2 / (trailing + leading),
    // full peel length for this direction
    full: 2 * (trailing + leading),
  };
}

// The stretches of the fold line that cross the sticker (it can cross twice,
// either side of the neck), as [[x, y], [x, y]] segments in local px.
export function creaseRuns(g, art) {
  const center = art.size / 2;
  const at = g.c - (g.dx + g.dy) * center;
  const fx = center + g.dx * at;
  const fy = center + g.dy * at;
  const point = (t) => [fx - g.dy * t, fy + g.dx * t];
  const runs = [];
  let start = null;
  const step = 2;
  for (let t = -art.size; t <= art.size + step; t += step) {
    const inside = t <= art.size && art.hit(...point(t));
    if (inside && start === null) start = t;
    if (!inside && start !== null) {
      runs.push([point(start), point(t - step)]);
      start = null;
    }
  }
  return runs;
}

// Canvas-order matrix [a, b, c, d, e, f] reflecting across the fold line.
export function reflection(g) {
  const { dx, dy, c } = g;
  return [1 - 2 * dx * dx, -2 * dx * dy, -2 * dx * dy, 1 - 2 * dy * dy, 2 * c * dx, 2 * c * dy];
}

export function rotate(x, y, rad) {
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: x * cos - y * sin, y: x * sin + y * cos };
}
