/** Colour-blind-safe player colours (Okabe-Ito derived), paired with letter badges. */
export const PLAYER_COLORS = [0xffb000, 0x3fa9f5, 0xff5c8a, 0x3ddc97];
export const PLAYER_CSS = ['#ffb000', '#3fa9f5', '#ff5c8a', '#3ddc97'];

export const WATER_SHALLOW = 0x1d6b83;
export const WATER_DEEP = 0x04141e;
// The walls sit back; the ledges sit forward. Keeping those two families
// apart is what makes the board readable on a phone.
export const ROCK = 0x1c3643;
export const ROCK_LIT = 0x2a4c5c;
export const LEDGE = 0x5f94a8;
/**
 * Deep ledges fade toward this, never toward ROCK. They used to interpolate
 * all the way to the wall colour, so the deepest shelf of a trench was tinted
 * to exactly the rock behind it and disappeared.
 */
export const LEDGE_DEEP = 0x3e6a7d;
export const LEDGE_LEGAL = 0x7ff2d0;
export const GOLD = 0xffc94d;

/** Depth 0..1 down the board, used to fade rock and light into the dark. */
export function depthMix(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  const k = Math.min(1, Math.max(0, t));
  return (
    ((ar + (br - ar) * k) << 16) | ((ag + (bg - ag) * k) << 8) | (ab + (bb - ab) * k)
  ) & 0xffffff;
}
