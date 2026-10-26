// Builds a sticker's pixels at runtime from any image with a transparent
// background (or a plain rectangle, like a book cover): a die-cut border, the
// image on top, and the paper back. Doing it here instead of baking PNGs keeps
// border width, cut smoothing and filter tunable.

const images = new Map();

// Loads an image URL once (cached). A canvas, image or bitmap is used as is.
export function loadImage(src) {
  if (typeof src !== "string") return Promise.resolve(src);
  if (!images.has(src)) {
    images.set(
      src,
      new Promise((resolve, reject) => {
        const img = new Image();
        img.decoding = "async";
        // Canvas pixels are needed, so cross-origin images must allow CORS.
        img.crossOrigin = "anonymous";
        // Decoded off the main thread before anything draws it.
        img.onload = () => img.decode().then(() => resolve(img), () => resolve(img));
        img.onerror = reject;
        img.src = src;
      })
    );
  }
  return images.get(src);
}

const INF = 1e20;

// Felzenszwalb & Huttenlocher's exact 1D squared distance transform.
function edt1d(f, d, v, z, n) {
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

// Squared distance from every pixel to the nearest pixel where mask is set.
function distanceTo(mask, w, h) {
  const grid = new Float64Array(w * h);
  for (let i = 0; i < grid.length; i++) grid[i] = mask[i] ? 0 : INF;
  const n = Math.max(w, h);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = grid[y * w + x];
    edt1d(f, d, v, z, h);
    for (let y = 0; y < h; y++) grid[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = grid[y * w + x];
    edt1d(f, d, v, z, w);
    for (let x = 0; x < w; x++) grid[y * w + x] = d[x];
  }
  return grid;
}

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.replace(/./g, "$&$&") : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function grey(filter, r, g, b) {
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  if (filter === "mono") return (y - 128) * 1.08 + 128;
  // "ink": stark, photocopied black and white
  return (y - 118) * 1.9 + 140;
}

// A PNG object URL, encoded off the main thread where the browser can.
function toURL(canvas) {
  return new Promise((resolve) => {
    if (!canvas.toBlob) return resolve(canvas.toDataURL());
    canvas.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : canvas.toDataURL()));
  });
}

function toCanvas(imageData) {
  const c = document.createElement("canvas");
  c.width = imageData.width;
  c.height = imageData.height;
  c.getContext("2d").putImageData(imageData, 0, 0);
  return c;
}

const DIRECTIONS = 120;

export async function buildArt({
  src: url,
  size,
  dpr,
  border,
  smoothing,
  borderColor,
  backColor,
  filter,
}) {
  const img = await loadImage(url);
  const W = Math.round(size * dpr);
  const r = Math.max(0, border * dpr);
  const close = Math.max(0, smoothing * size * dpr);
  // Margin so the border, and the closing pass, never touch the canvas edge.
  const m = Math.ceil(r + close + 3);
  // Fit inside the square without stretching: covers stand tall, logos lie
  // wide. The canvases only cover the image (plus the margin), not the whole
  // square, so a long strip doesn't pay for all the empty space around it.
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const fit = W / Math.max(iw, ih);
  const dw = iw * fit;
  const dh = ih * fit;
  const NX = Math.ceil(dw) + 2 * m;
  const NY = Math.ceil(dh) + 2 * m;
  // Where the square's top-left corner sits on the canvases, in device px.
  const ox = m - (W - dw) / 2;
  const oy = m - (W - dh) / 2;

  const work = document.createElement("canvas");
  work.width = NX;
  work.height = NY;
  const wctx = work.getContext("2d", { willReadFrequently: true });
  wctx.imageSmoothingQuality = "high";
  wctx.drawImage(img, m, m, dw, dh);
  const src = wctx.getImageData(0, 0, NX, NY).data;
  const count = NX * NY;

  const subject = new Uint8Array(count);
  for (let i = 0; i < count; i++) subject[i] = src[i * 4 + 3] >= 128;

  // The die-cut: grow the subject by border + close, then shrink by close.
  // The closing bridges small notches (neck, ears, stray hair) like a real
  // cutter. The outline is smooth, so its distance fields are worked out at
  // half resolution and interpolated: it looks the same for a quarter of the work.
  const HX = Math.ceil(NX / 2);
  const HY = Math.ceil(NY / 2);
  const small = new Uint8Array(HX * HY);
  for (let y = 0; y < NY; y++) {
    for (let x = 0; x < NX; x++) if (subject[y * NX + x]) small[(y >> 1) * HX + (x >> 1)] = 1;
  }
  const outside = distanceTo(small, HX, HY);
  const reach = (r + close) / 2 - 0.25; // half-res px; the pooling above grows the subject a hair
  const notGrown = new Uint8Array(HX * HY);
  for (let i = 0; i < notGrown.length; i++) notGrown[i] = outside[i] > reach * reach ? 1 : 0;
  const inside = distanceTo(notGrown, HX, HY);
  const depth = new Float32Array(HX * HY); // full-res px from the grown edge, inwards
  for (let i = 0; i < depth.length; i++) depth[i] = Math.sqrt(inside[i]) * 2;
  // Where each full-res pixel falls on the half-res grid, for interpolating.
  const grid = (n, h) => {
    const cell = new Int32Array(n);
    const frac = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      const f = Math.min(h - 1.001, Math.max(0, (k + 0.5) / 2 - 0.5));
      cell[k] = Math.floor(f);
      frac[k] = f - cell[k];
    }
    return { cell, frac };
  };
  const gx = grid(NX, HX);
  const gy = grid(NY, HY);

  const front = new ImageData(NX, NY);
  const back = new ImageData(NX, NY);
  const cut = new Uint8Array(count);
  const [br, bg, bb] = hexToRgb(borderColor);
  const [kr, kg, kb] = hexToRgb(backColor);
  // Pull the image edge in a touch so any fringe left from the original
  // background never shows against the border: its outermost pixels go soft.
  const rim = dpr >= 2 ? 0.25 : 0.5;

  for (let y = 0; y < NY; y++) {
    const ty = gy.frac[y];
    const a = gy.cell[y] * HX;
    const b = a + HX;
    for (let x = 0; x < NX; x++) {
      const x0 = gx.cell[x];
      const tx = gx.frac[x];
      const d0 = depth[a + x0];
      const d1 = depth[a + x0 + 1];
      const d2 = depth[b + x0];
      const d3 = depth[b + x0 + 1];
      if (d0 + d1 + d2 + d3 === 0) continue;
      const d = (d0 * (1 - tx) + d1 * tx) * (1 - ty) + (d2 * (1 - tx) + d3 * tx) * ty;
      const cutA = clamp01(d - close);
      if (cutA <= 0) continue;
      const i = y * NX + x;
      cut[i] = Math.round(cutA * 255);
      let photoA = 0;
      if (subject[i]) {
        const solid =
          x > 0 && y > 0 && x < NX - 1 && y < NY - 1 && subject[i - 1] && subject[i + 1] && subject[i - NX] && subject[i + NX];
        photoA = solid ? 1 : rim;
      }
      // inlined filter: no per-pixel allocation in the hot loop
      let pr = 0;
      let pg = 0;
      let pb = 0;
      if (photoA > 0) {
        pr = src[i * 4];
        pg = src[i * 4 + 1];
        pb = src[i * 4 + 2];
        if (filter !== "color") pr = pg = pb = grey(filter, pr, pg, pb);
      }
      // photo over border
      const outA = photoA + cutA * (1 - photoA);
      const j = i * 4;
      front.data[j] = (pr * photoA + br * cutA * (1 - photoA)) / outA;
      front.data[j + 1] = (pg * photoA + bg * cutA * (1 - photoA)) / outA;
      front.data[j + 2] = (pb * photoA + bb * cutA * (1 - photoA)) / outA;
      front.data[j + 3] = outA * 255;
      back.data[j] = kr;
      back.data[j + 1] = kg;
      back.data[j + 2] = kb;
      back.data[j + 3] = cutA * 255;
    }
  }

  // Support function of the cut outline (furthest extent in each direction,
  // measured from the image centre, in CSS px). The peel folds from the
  // silhouette's true edge rather than its bounding circle.
  const c = size / 2;
  const support = new Float32Array(DIRECTIONS).fill(-INF);
  const bounds = { minX: INF, minY: INF, maxX: -INF, maxY: -INF };
  const cosT = new Float32Array(DIRECTIONS);
  const sinT = new Float32Array(DIRECTIONS);
  for (let k = 0; k < DIRECTIONS; k++) {
    cosT[k] = Math.cos((k / DIRECTIONS) * Math.PI * 2);
    sinT[k] = Math.sin((k / DIRECTIONS) * Math.PI * 2);
  }
  for (let y = 1; y < NY - 1; y++) {
    for (let x = 1; x < NX - 1; x++) {
      const i = y * NX + x;
      if (cut[i] < 128) continue;
      const edge = cut[i - 1] < 128 || cut[i + 1] < 128 || cut[i - NX] < 128 || cut[i + NX] < 128;
      if (!edge) continue;
      const lx = (x - ox) / dpr;
      const ly = (y - oy) / dpr;
      if (lx < bounds.minX) bounds.minX = lx;
      if (lx > bounds.maxX) bounds.maxX = lx;
      if (ly < bounds.minY) bounds.minY = ly;
      if (ly > bounds.maxY) bounds.maxY = ly;
      for (let k = 0; k < DIRECTIONS; k++) {
        const h = (lx - c) * cosT[k] + (ly - c) * sinT[k];
        if (h > support[k]) support[k] = h;
      }
    }
  }

  // Convex hull of the outline (adjacent support lines intersected), padded a
  // little: the hit area, so a sticker stuck over the page only blocks clicks
  // on itself rather than on its whole square.
  const hull = [];
  for (let k = 0; k < DIRECTIONS; k += 2) {
    const k1 = (k + 2) % DIRECTIONS;
    const det = cosT[k] * sinT[k1] - sinT[k] * cosT[k1];
    const h0 = support[k] + 2;
    const h1 = support[k1] + 2;
    hull.push([c + (h0 * sinT[k1] - h1 * sinT[k]) / det, c + (cosT[k] * h1 - cosT[k1] * h0) / det]);
  }

  const frontCanvas = toCanvas(front);
  const backCanvas = toCanvas(back);
  // Encoded in the background; only cosmetic masks wait for these.
  const urls = Promise.all([toURL(frontCanvas), toURL(backCanvas)]).then(([front, back]) => ({ front, back }));

  return {
    size,
    dpr,
    // Where the canvases sit relative to the image square, in CSS px.
    box: { x: -ox / dpr, y: -oy / dpr, w: NX / dpr, h: NY / dpr },
    front: frontCanvas,
    back: backCanvas,
    urls, // Promise of { front, back } image URLs
    bounds,
    hull,
    // Furthest extent of the outline along unit vector (dx, dy).
    support(dx, dy) {
      let a = Math.atan2(dy, dx);
      if (a < 0) a += Math.PI * 2;
      const f = (a / (Math.PI * 2)) * DIRECTIONS;
      const k0 = Math.floor(f) % DIRECTIONS;
      const k1 = (k0 + 1) % DIRECTIONS;
      const t = f - Math.floor(f);
      return support[k0] * (1 - t) + support[k1] * t;
    },
    // Is the local point (CSS px, image-square coords) on the sticker?
    hit(x, y) {
      const px = Math.round(x * dpr + ox);
      const py = Math.round(y * dpr + oy);
      if (px < 0 || py < 0 || px >= NX || py >= NY) return false;
      return cut[py * NX + px] >= 128;
    },
  };
}

// A soft shadow of the cut shape, blurred once into a canvas, so moving or
// repainting the sticker never has to blur it again (a CSS drop-shadow does,
// every time anything inside it changes). `layers` are like drop-shadows:
// [{ y, blur, alpha }]. Drawn at `scale` device px per CSS px; returns the
// canvas and where it sits relative to the image square, in CSS px.
export function castShadow(art, layers, scale = 1) {
  const pad = Math.ceil(Math.max(...layers.map((l) => l.blur * 1.5 + Math.abs(l.y))));
  const { box } = art;
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil((box.w + 2 * pad) * scale);
  canvas.height = Math.ceil((box.h + 2 * pad) * scale);
  const ctx = canvas.getContext("2d");
  // Drawn far off to the side so only the shadow lands on the canvas.
  const far = canvas.width + 50;
  for (const l of layers) {
    ctx.shadowColor = `rgba(0,0,0,${l.alpha})`;
    ctx.shadowBlur = l.blur * scale;
    ctx.shadowOffsetX = far;
    ctx.shadowOffsetY = l.y * scale;
    ctx.drawImage(art.back, pad * scale - far, pad * scale, box.w * scale, box.h * scale);
  }
  return { canvas, x: box.x - pad, y: box.y - pad, w: box.w + 2 * pad, h: box.h + 2 * pad };
}
