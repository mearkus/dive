import { CanvasTexture, LinearFilter, LinearMipmapLinearFilter, SRGBColorSpace, type Texture } from 'three';

const cache = new Map<string, Texture>();

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  return [c, ctx];
}

function finish(c: HTMLCanvasElement): Texture {
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  // Mipmaps matter here: these labels are drawn far smaller than their source
  // canvas (a 256px plate lands on ~20px of a phone screen), and plain linear
  // minification aliases the glyphs into noise.
  tex.generateMipmaps = true;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.magFilter = LinearFilter;
  tex.anisotropy = 8;
  return tex;
}

/**
 * The ledge cost plate. DESIGN.md §10 calls legibility under fog the single
 * biggest rendering risk, so these are rendered large, high-contrast, and on
 * an opaque backing plate rather than as bare glyphs in the water.
 */
export function costPlate(value: number, legal: boolean): Texture {
  const key = `cost:${value}:${legal}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const S = 256;
  const [c, ctx] = canvas(S, S);
  const ink = legal ? '#04222b' : '#f2fbff';
  // Opaque, not translucent: a see-through plate lets the rock behind it eat
  // the strokes once the plate is only ~30px on screen.
  const plate = legal ? '#7ff2d0' : '#0b2b38';

  ctx.beginPath();
  ctx.roundRect(10, 10, S - 20, S - 20, 42);
  ctx.fillStyle = plate;
  ctx.fill();
  ctx.lineWidth = 9;
  ctx.strokeStyle = legal ? '#d8fff2' : 'rgba(160,226,246,0.8)';
  ctx.stroke();

  ctx.fillStyle = ink;
  ctx.font = `800 ${S * 0.72}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(value), S / 2, S / 2 + S * 0.04);

  const tex = finish(c);
  cache.set(key, tex);
  return tex;
}

/** Player letter badge worn by each diver — the colour-blind fallback. */
export function diverBadge(letter: string, css: string): Texture {
  const key = `badge:${letter}:${css}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const S = 128;
  const [c, ctx] = canvas(S, S);
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S / 2 - 8, 0, Math.PI * 2);
  ctx.fillStyle = css;
  ctx.fill();
  ctx.lineWidth = 7;
  ctx.strokeStyle = 'rgba(4,20,28,0.85)';
  ctx.stroke();

  ctx.fillStyle = '#06202a';
  ctx.font = `800 ${S * 0.6}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, S / 2, S / 2 + S * 0.04);

  const tex = finish(c);
  cache.set(key, tex);
  return tex;
}

/** Trench nameplate hung above each shaft. */
export function nameplate(text: string, sub: string, dim: boolean): Texture {
  const key = `name:${text}:${sub}:${dim}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const W = 512;
  const H = 160;
  const [c, ctx] = canvas(W, H);
  ctx.beginPath();
  ctx.roundRect(6, 6, W - 12, H - 12, 18);
  ctx.fillStyle = dim ? 'rgba(6,24,32,0.75)' : 'rgba(8,38,50,0.9)';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = dim ? 'rgba(120,170,190,0.3)' : 'rgba(127,242,208,0.55)';
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = dim ? '#6d95a4' : '#dffbff';
  ctx.font = '600 54px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText(text, W / 2, 68);
  ctx.fillStyle = dim ? '#55798a' : '#7ff2d0';
  ctx.font = '500 34px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText(sub, W / 2, 118);

  const tex = finish(c);
  cache.set(key, tex);
  return tex;
}

/** Procedural rock face — flat colour reads as cardboard, not stone. */
export function rockFace(seed: number): Texture {
  const key = `rock:${seed}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const W = 256;
  const H = 640;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#2b5566';
  ctx.fillRect(0, 0, W, H);

  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);

  // Vertical strata, scoured by the current.
  for (let i = 0; i < 190; i++) {
    const x = rnd() * W;
    const w = 3 + rnd() * 26;
    const shade = 0.5 + rnd() * 0.5;
    ctx.fillStyle = `rgba(${18 * shade | 0},${52 * shade | 0},${64 * shade | 0},${0.16 + rnd() * 0.3})`;
    ctx.fillRect(x, rnd() * H, w, 40 + rnd() * 240);
  }
  for (let i = 0; i < 70; i++) {
    ctx.fillStyle = `rgba(150,215,235,${0.02 + rnd() * 0.05})`;
    ctx.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 3, 20 + rnd() * 90);
  }
  // Darken toward the bottom: light does not reach the floor.
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  // Was 0.72, which crushed the lower two thirds of every wall to black and
  // took the rock with it. Depth is carried by fog and lighting; the texture
  // only needs to hint at it.
  grad.addColorStop(1, 'rgba(0,0,0,0.42)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  const tex = finish(c);
  cache.set(key, tex);
  return tex;
}

/** The waterline seen from below. */
export function surfaceShimmer(): Texture {
  const key = 'shimmer';
  const hit = cache.get(key);
  if (hit) return hit;
  const S = 512;
  const [c, ctx] = canvas(S, S);
  ctx.fillStyle = '#5fd3f0';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.35})`;
    ctx.beginPath();
    ctx.ellipse(Math.random() * S, Math.random() * S, 4 + Math.random() * 26, 2 + Math.random() * 5, Math.random() * 3, 0, 6.3);
    ctx.fill();
  }
  const tex = finish(c);
  cache.set(key, tex);
  return tex;
}

/** Vertical gradient backdrop: sunlit shallows fading to the black deep. */
export function waterBackdrop(): Texture {
  const key = 'backdrop';
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, ctx] = canvas(8, 512);
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#2f93b4');
  grad.addColorStop(0.16, '#14596f');
  grad.addColorStop(0.45, '#07293a');
  grad.addColorStop(1, '#02090f');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 8, 512);
  const tex = finish(c);
  cache.set(key, tex);
  return tex;
}

/** Remaining treasure on a wreck, drawn as a row of coins, richest first. */
export function treasurePlate(values: number[]): Texture {
  const key = `loot:${values.join('-')}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const W = 512;
  const H = 150;
  const [c, ctx] = canvas(W, H);

  if (!values.length) {
    ctx.beginPath();
    ctx.roundRect(5, 5, W - 10, H - 10, 20);
    ctx.fillStyle = 'rgba(18,26,30,0.82)';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(120,150,165,0.32)';
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#7d9aa8';
    ctx.font = '600 56px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('stripped', W / 2, H / 2);
    const tex = finish(c);
    cache.set(key, tex);
    return tex;
  }

  const radius = Math.min(56, (W - 40) / (values.length * 2.25));
  const step = radius * 2.18;
  const startX = W / 2 - (step * (values.length - 1)) / 2;

  values.forEach((value, i) => {
    const x = startX + i * step;
    const y = H / 2;

    // Coin edge, struck face, rim. Leftmost is richest — what the next diver
    // to reach the floor actually takes.
    ctx.beginPath();
    ctx.arc(x, y + radius * 0.12, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#6b4c0d';
    ctx.fill();

    const face = ctx.createRadialGradient(x - radius * 0.35, y - radius * 0.4, radius * 0.1, x, y, radius);
    face.addColorStop(0, '#ffe9a8');
    face.addColorStop(0.55, '#f0bb43');
    face.addColorStop(1, '#a97a14');
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = face;
    ctx.fill();

    ctx.lineWidth = Math.max(2, radius * 0.11);
    ctx.strokeStyle = 'rgba(255, 246, 208, 0.75)';
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.82, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#4a3206';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${radius * (value > 9 ? 0.9 : 1.15)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.fillText(String(value), x, y + radius * 0.04);
  });

  const tex = finish(c);
  cache.set(key, tex);
  return tex;
}
