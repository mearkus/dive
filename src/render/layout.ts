/**
 * Board layout maths, shared by the renderer and by hit-testing so a click
 * always lands where the eye says it should.
 */
export const TRENCH_SPACING = 7.6;
/**
 * Vertical gap between ledges. Mutable because portrait viewports need more
 * of it: there the camera distance is set by board width, leaving vertical
 * slack, while labels scale up to stay readable and would otherwise collide.
 * Live ES module binding — configureLayout() must run before the board is built.
 */
export let LEDGE_DROP = 2.0;
export const LEDGE_WIDTH = 5.2;
export const LEDGE_DEPTH = 2.3;
export const SURFACE_Y = 1.2;
/** Trench nameplates hang above the waiting divers. */
export let NAMEPLATE_Y = 5.4;

/**
 * Choose the vertical layout for a viewport shape. Returns true when the
 * values actually changed, which is the signal to re-lay-out the board —
 * rotating a phone must not leave portrait spacing on a landscape screen.
 */
export function configureLayout(aspect: number): boolean {
  const portrait = aspect < 0.95;
  const drop = portrait ? 3.5 : 2.0;
  if (drop === LEDGE_DROP) return false;
  LEDGE_DROP = drop;
  NAMEPLATE_Y = portrait ? 6.4 : 5.4;
  return true;
}

export function trenchX(index: number, count: number): number {
  return (index - (count - 1) / 2) * TRENCH_SPACING;
}

/** Ledge 1 is the topmost; ledge 0 means the surface. */
export function ledgeY(ledge: number): number {
  return ledge === 0 ? SURFACE_Y : -ledge * LEDGE_DROP;
}

/** The left of each ledge belongs to its cost plate; divers use the rest. */
export const DIVER_ROW_OFFSET = 0.75;

/** Spread divers along a ledge, tightening the spacing as a stack grows. */
export function diverSlotX(index: number, total: number): number {
  const spacing = Math.min(0.95, (LEDGE_WIDTH - 2.5) / Math.max(1, total));
  return (index - (total - 1) / 2) * spacing + DIVER_ROW_OFFSET;
}

/**
 * The vertical span of everything drawn, measured rather than guessed: from the
 * top of the trench nameplates down past the treasure hanging below the
 * deepest wreck. Framing used constants that did not match this, which left
 * the board a little too high and put a nameplate behind the HUD.
 */
export function verticalExtent(maxDepth: number) {
  // The extra top margin drops the nameplates clear of the HUD chips, which
  // sit at the same height on the left.
  const top = NAMEPLATE_Y + 2.6;
  const bottom = -(maxDepth * LEDGE_DROP) - 3.1;
  return { top, bottom, height: top - bottom, center: (top + bottom) / 2 };
}

/** The world-space box the board occupies, including surface and nameplates. */
export function boardExtent(trenchCount: number, maxDepth: number) {
  return {
    width: trenchCount * TRENCH_SPACING + 5.5,
    height: verticalExtent(maxDepth).height,
  };
}

/** Where the camera should look to frame a board of this size. */
export function frameFor(trenchCount: number, maxDepth: number) {
  const { center, height } = verticalExtent(maxDepth);
  return {
    center: { x: 0, y: center, z: 0 },
    distance: Math.max(26, trenchCount * 8.2, height * 1.4),
  };
}

/**
 * Distance at which the whole board fits, given the viewport's aspect ratio.
 * Without the horizontal term a narrow phone screen shows only the middle
 * trenches.
 */
export function fitDistance(
  fovDegrees: number,
  aspect: number,
  trenchCount: number,
  maxDepth: number,
  /** Share of the viewport height covered by the HUD and card tray, 0..1. */
  chromeFraction = 0.28,
): number {
  const { width, height } = boardExtent(trenchCount, maxDepth);
  const vFov = (fovDegrees * Math.PI) / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
  // Measured chrome beats a guessed constant: a phone held sideways gives the
  // board barely a third of its height, where a fixed factor hid it behind
  // the tray.
  const usable = Math.max(0.3, 1 - Math.min(0.66, chromeFraction));
  return Math.max(
    width / 2 / Math.tan(hFov / 2),
    height / usable / 2 / Math.tan(vFov / 2),
  );
}
