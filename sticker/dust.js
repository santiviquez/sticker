// Dirt for the paper backs of stickers that have been stuck down too many
// times: specks, grit, lint, the odd hair, and fingerprints from handling.

const TAU = Math.PI * 2;

export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LINT = ["58,54,50", "70,82,110", "92,80,66", "40,36,34"];

// One piece of dirt ("dot", "grit", "fiber" or "hair"), described so it can
// be drawn anywhere at any angle. `rand` returns numbers in [0, 1).
export function makeSpeck(rand, kind) {
  if (kind === "dot") return { kind, r: 0.22 + rand() * 0.6, alpha: 0.16 + rand() * 0.36 };
  if (kind === "grit") {
    const sides = 5 + Math.floor(rand() * 3);
    return {
      kind,
      r: 0.6 + rand() * 1.1,
      alpha: 0.35 + rand() * 0.35,
      radii: Array.from({ length: sides }, () => 0.6 + rand() * 0.6),
    };
  }
  if (kind === "fiber") {
    return {
      kind,
      angle: rand() * TAU,
      len: 4 + rand() * 11,
      bend: rand() - 0.5,
      color: LINT[Math.floor(rand() * LINT.length)],
      alpha: 0.35 + rand() * 0.3,
      width: 0.3 + rand() * 0.3,
    };
  }
  return {
    kind: "hair",
    angle: rand() * TAU,
    segs: Array.from({ length: 3 }, () => ({ len: 9 + rand() * 9, turn: (rand() - 0.5) * 2.2 })),
  };
}

// Draws a speck at (x, y), turned by `turn` radians.
export function drawSpeck(ctx, sp, x, y, turn = 0) {
  if (sp.kind === "dot") {
    ctx.fillStyle = `rgba(62,55,48,${sp.alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, sp.r, 0, TAU);
    ctx.fill();
  } else if (sp.kind === "grit") {
    ctx.fillStyle = `rgba(74,64,54,${sp.alpha})`;
    ctx.beginPath();
    sp.radii.forEach((k, i) => {
      const a = (i / sp.radii.length) * TAU + turn;
      const px = x + Math.cos(a) * sp.r * k;
      const py = y + Math.sin(a) * sp.r * k;
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    });
    ctx.closePath();
    ctx.fill();
  } else if (sp.kind === "fiber") {
    const a = sp.angle + turn;
    const bend = sp.bend * sp.len * 0.8;
    const ex = x + Math.cos(a) * sp.len;
    const ey = y + Math.sin(a) * sp.len;
    ctx.strokeStyle = `rgba(${sp.color},${sp.alpha})`;
    ctx.lineWidth = sp.width;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo((x + ex) / 2 - Math.sin(a) * bend, (y + ey) / 2 + Math.cos(a) * bend, ex, ey);
    ctx.stroke();
  } else {
    let a = sp.angle + turn;
    ctx.strokeStyle = "rgba(34,26,20,0.6)";
    ctx.lineWidth = 0.42;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (const seg of sp.segs) {
      const a2 = a + seg.turn;
      const nx = x + Math.cos(a2) * seg.len;
      const ny = y + Math.sin(a2) * seg.len;
      ctx.bezierCurveTo(
        x + Math.cos(a) * seg.len * 0.5,
        y + Math.sin(a) * seg.len * 0.5,
        nx - Math.cos(a2) * seg.len * 0.4,
        ny - Math.sin(a2) * seg.len * 0.4,
        nx,
        ny
      );
      x = nx;
      y = ny;
      a = a2;
    }
    ctx.stroke();
  }
}

// The paper back after `level` stickings: duller, with fingerprints from
// being handled and made-up dirt (scaled by `amount`, seeded per level so
// each keeps the last's), plus any `marks` added from outside.
export function dirtyBack(art, level, amount = 1, marks = []) {
  const canvas = document.createElement("canvas");
  canvas.width = art.back.width;
  canvas.height = art.back.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(art.back, 0, 0);
  if (level <= 0 && !marks.length) return canvas;

  const s = art.size;
  ctx.globalCompositeOperation = "source-atop";
  ctx.setTransform(art.dpr, 0, 0, art.dpr, -art.box.x * art.dpr, -art.box.y * art.dpr);

  // Duller, dirtier paper overall.
  ctx.fillStyle = `rgba(110,96,78,${Math.min(0.22, 0.035 * level)})`;
  ctx.fillRect(art.box.x, art.box.y, art.box.w, art.box.h);

  marks.forEach((sp) => drawSpeck(ctx, sp, sp.lx, sp.ly, sp.turn || 0));

  for (let l = 1; l <= level; l++) {
    const rand = seeded(l * 7919 + 13);
    const inside = () => {
      for (let i = 0; i < 60; i++) {
        const x = rand() * s;
        const y = rand() * s;
        if (art.hit(x, y)) return [x, y];
      }
      return [s / 2, s / 2];
    };

    if (amount > 0) {
      for (let i = 0; i < Math.round(45 * amount); i++) drawSpeck(ctx, makeSpeck(rand, "dot"), ...inside());
      for (let i = 0; i < Math.round(6 * amount); i++) drawSpeck(ctx, makeSpeck(rand, "grit"), ...inside());
      for (let i = 0; i < Math.round(4 * amount); i++) drawSpeck(ctx, makeSpeck(rand, "fiber"), ...inside());
      if (l >= 3) drawSpeck(ctx, makeSpeck(rand, "hair"), ...inside());
    }

    // A fingerprint near the edge, where it was held: broken concentric ridges.
    let at = inside();
    for (let i = 0; i < 80; i++) {
      const p = inside();
      const a = rand() * TAU;
      if (!art.hit(p[0] + Math.cos(a) * 9, p[1] + Math.sin(a) * 9)) {
        at = p;
        break;
      }
    }
    ctx.save();
    ctx.translate(at[0], at[1]);
    ctx.rotate(rand() * Math.PI);
    ctx.strokeStyle = "rgba(92,80,66,0.11)";
    ctx.lineWidth = 0.45;
    for (let r = 1.2; r < 8; r += 0.85) {
      for (let k = 0; k < 3; k++) {
        const start = rand() * TAU;
        ctx.beginPath();
        ctx.ellipse(0, 0, r, r * 1.35, 0, start, start + 1.2 + rand() * 1.4);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  return canvas;
}
