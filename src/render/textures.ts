import { CanvasTexture, LinearFilter, SRGBColorSpace, type Texture } from 'three';

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
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.anisotropy = 4;
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
  const ink = legal ? '#04222b' : '#bfe8f7';
  const plate = legal ? '#7ff2d0' : 'rgba(8,32,42,0.88)';

  ctx.beginPath();
  ctx.roundRect(18, 18, S - 36, S - 36, 46);
  ctx.fillStyle = plate;
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = legal ? '#d8fff2' : 'rgba(150,220,240,0.55)';
  ctx.stroke();

  ctx.fillStyle = ink;
  ctx.font = `700 ${S * 0.58}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(value), S / 2, S / 2 + S * 0.03);

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
  ctx.fillStyle = '#224654';
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
  grad.addColorStop(1, 'rgba(0,0,0,0.72)');
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

/** Remaining treasure on a wreck: big gold digits, richest first. */
export function treasurePlate(values: number[]): Texture {
  const key = `loot:${values.join('-')}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const W = 512;
  const H = 150;
  const [c, ctx] = canvas(W, H);
  ctx.beginPath();
  ctx.roundRect(5, 5, W - 10, H - 10, 20);
  ctx.fillStyle = values.length ? 'rgba(46,32,6,0.92)' : 'rgba(20,26,30,0.8)';
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = values.length ? 'rgba(255,201,77,0.75)' : 'rgba(120,150,165,0.3)';
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (!values.length) {
    ctx.fillStyle = '#7d9aa8';
    ctx.font = '600 58px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('stripped', W / 2, H / 2);
  } else {
    ctx.fillStyle = '#ffc94d';
    ctx.font = `800 ${values.length > 3 ? 76 : 88}px ui-sans-serif, system-ui, sans-serif`;
    ctx.fillText(values.join('  '), W / 2, H / 2 + 4);
  }

  const tex = finish(c);
  cache.set(key, tex);
  return tex;
}
