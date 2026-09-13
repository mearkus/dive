/**
 * Board layout maths, shared by the renderer and by hit-testing so a click
 * always lands where the eye says it should.
 */
export const TRENCH_SPACING = 7.6;
export const LEDGE_DROP = 2.0;
export const LEDGE_WIDTH = 5.2;
export const LEDGE_DEPTH = 2.3;
export const SURFACE_Y = 1.2;
/** Trench nameplates hang above the waiting divers. */
export const NAMEPLATE_Y = 5.4;

export function trenchX(index: number, count: number): number {
  return (index - (count - 1) / 2) * TRENCH_SPACING;
}

/** Ledge 1 is the topmost; ledge 0 means the surface. */
export function ledgeY(ledge: number): number {
  return ledge === 0 ? SURFACE_Y : -ledge * LEDGE_DROP;
}

/** Spread divers along a ledge, tightening the spacing as a stack grows. */
export function diverSlotX(index: number, total: number): number {
  const spacing = Math.min(0.95, (LEDGE_WIDTH - 1.1) / Math.max(1, total));
  return (index - (total - 1) / 2) * spacing;
}

/** The world-space box the board occupies, including surface and nameplates. */
export function boardExtent(trenchCount: number, maxDepth: number) {
  return {
    width: trenchCount * TRENCH_SPACING + 5.5,
    height: maxDepth * LEDGE_DROP + 9.5,
  };
}

/** Where the camera should look to frame a board of this size. */
export function frameFor(trenchCount: number, maxDepth: number) {
  const height = maxDepth * LEDGE_DROP;
  return {
    // Sit the framing slightly high so the top HUD does not sit on the
    // trench nameplates.
    center: { x: 0, y: -height / 2 + 1.4, z: 0 },
    distance: Math.max(26, trenchCount * 8.2, height * 1.55),
  };
}

/**
 * Distance at which the whole board fits, given the viewport's aspect ratio.
 * Without the horizontal term a narrow phone screen shows only the middle
 * trenches.
 */
export function fitDistance(fovDegrees: number, aspect: number, trenchCount: number, maxDepth: number): number {
  const { width, height } = boardExtent(trenchCount, maxDepth);
  const vFov = (fovDegrees * Math.PI) / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
  // Leave room for the HUD above and the card tray below.
  const chrome = aspect < 1 ? 1.38 : 1.4;
  return Math.max(
    width / 2 / Math.tan(hFov / 2),
    (height * chrome) / 2 / Math.tan(vFov / 2),
  );
}
