// Builds a sticker's pixels at runtime from any image with a transparent
// background (or a plain rectangle, like a book cover): a die-cut border, the
// image on top, and the paper back. Doing it here instead of baking PNGs keeps
// border width, cut smoothing and filter tunable.

const images = new Map();

export function loadImage(src) {
  if (!images.has(src)) {
    images.set(
      src,
      new Promise((resolve, reject) => {
        const img = new Image();
        img.decoding = "async";
        // Canvas pixels are needed, so cross-origin images must allow CORS.
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
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

// Signed distance in px to the mask's edge (negative inside), with the edge
// sitting between pixel centres so thresholds anti-alias cleanly.
function signedDistance(mask, w, h) {
  const outside = distanceTo(mask, w, h);
  const inverse = new Uint8Array(w * h);
  for (let i = 0; i < inverse.length; i++) inverse[i] = mask[i] ? 0 : 1;
  const inside = distanceTo(inverse, w, h);
  const sd = new Float32Array(w * h);
  for (let i = 0; i < sd.length; i++) {
    sd[i] = mask[i] ? 0.5 - Math.sqrt(inside[i]) : Math.sqrt(outside[i]) - 0.5;
  }
  return sd;
}

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.replace(/./g, "$&$&") : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function applyFilter(filter, r, g, b) {
  if (filter === "color") return [r, g, b];
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  if (filter === "mono") {
    const v = (y - 128) * 1.08 + 128;
    return [v, v, v];
  }
  // "ink": stark, photocopied black and white
  const v = (y - 118) * 1.9 + 140;
  return [v, v, v];
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
  const N = W + 2 * m;

  const work = document.createElement("canvas");
  work.width = work.height = N;
  const wctx = work.getContext("2d", { willReadFrequently: true });
  wctx.imageSmoothingQuality = "high";
  // Fit inside the square without stretching: covers stand tall, logos lie wide.
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const fit = W / Math.max(iw, ih);
  const dw = iw * fit;
  const dh = ih * fit;
  wctx.drawImage(img, m + (W - dw) / 2, m + (W - dh) / 2, dw, dh);
  const src = wctx.getImageData(0, 0, N, N).data;

  const subject = new Uint8Array(N * N);
  for (let i = 0; i < subject.length; i++) subject[i] = src[i * 4 + 3] >= 128;
  const sdSubject = signedDistance(subject, N, N);

  // Die-cut: grow the subject by border + close, then shrink by close. The
  // closing bridges small notches (neck, ears, stray hair) like a real cutter.
  const grown = new Uint8Array(N * N);
  for (let i = 0; i < grown.length; i++) grown[i] = sdSubject[i] <= r + close;
  const sdCut = signedDistance(grown, N, N);

  const front = new ImageData(N, N);
  const back = new ImageData(N, N);
  const cut = new Uint8Array(N * N);
  const [br, bg, bb] = hexToRgb(borderColor);
  const [kr, kg, kb] = hexToRgb(backColor);
  // Pull the image edge in a touch so any fringe left from the original
  // background never shows against the border.
  const inset = Math.min(1.2, 0.6 * dpr);

  for (let i = 0; i < N * N; i++) {
    const cutA = clamp01(0.5 - (sdCut[i] + close));
    if (cutA <= 0) continue;
    cut[i] = Math.round(cutA * 255);
    const photoA = clamp01(0.5 - (sdSubject[i] + inset));
    const [pr, pg, pb] = photoA > 0 ? applyFilter(filter, src[i * 4], src[i * 4 + 1], src[i * 4 + 2]) : [0, 0, 0];
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
  for (let y = 1; y < N - 1; y++) {
    for (let x = 1; x < N - 1; x++) {
      const i = y * N + x;
      if (cut[i] < 128) continue;
      const edge = cut[i - 1] < 128 || cut[i + 1] < 128 || cut[i - N] < 128 || cut[i + N] < 128;
      if (!edge) continue;
      const lx = (x - m) / dpr;
      const ly = (y - m) / dpr;
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

  return {
    size,
    dpr,
    margin: m / dpr, // CSS px the canvases extend past the image square
    full: N / dpr, // CSS px width/height of the canvases
    front: frontCanvas,
    back: backCanvas,
    frontURL: frontCanvas.toDataURL(),
    backURL: backCanvas.toDataURL(),
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
      const px = Math.round(x * dpr + m);
      const py = Math.round(y * dpr + m);
      if (px < 0 || py < 0 || px >= N || py >= N) return false;
      return cut[py * N + px] >= 128;
    },
  };
}
