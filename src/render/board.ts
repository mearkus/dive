import {
  BoxGeometry,
  ExtrudeGeometry,
  Shape,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Sprite,
  SpriteMaterial,
  type Object3D,
} from 'three';
import type { GameState } from '../rules/index.js';
import { GOLD, LEDGE, LEDGE_DEEP, depthMix } from './palette.js';
import { costPlate, nameplate, rockFace, surfaceShimmer } from './textures.js';
import { DIVER_ROW_OFFSET, LEDGE_DEPTH, LEDGE_DROP, LEDGE_WIDTH, NAMEPLATE_Y, SURFACE_Y, ledgeY, trenchX } from './layout.js';

export interface LedgeView {
  trench: number;
  /** 1-based; the deepest ledge of a trench is its wreck. */
  ledge: number;
  shelf: Mesh;
  plate: Sprite;
  /** The dive line drawn through a shared ledge; hidden when fewer than two divers. */
  line: Mesh;
  group: Group;
  isWreck: boolean;
}

interface WallView {
  mesh: Mesh;
  flanks: Mesh[];
  /** Height the geometry was built at, so a relayout can scale from it. */
  builtHeight: number;
  depth: number;
}

export interface BoardView {
  root: Group;
  ledges: LedgeView[];
  /** Invisible fat boxes used for picking — easier to hit than the shelves. */
  targets: Mesh[];
  nameplates: { trench: number; sprite: Sprite }[];
  treasureLabels: { trench: number; sprite: Sprite }[];
  /** Kelp blades, swayed by the render loop. */
  kelp: { mesh: Mesh; phase: number; lean: number }[];
  ledgeAt(trench: number, ledge: number): LedgeView | undefined;
  /** Reposition everything that depends on LEDGE_DROP / NAMEPLATE_Y. */
  relayout(): void;
}

/**
 * An outcrop, not a box: the slab is a slightly irregular polygon so the
 * ledges read as broken rock shelves rather than shipping crates. Seeded off
 * the trench and ledge so every shelf differs but is stable across relayouts.
 */
function rockSlab(seed: number, width: number, depth: number): ExtrudeGeometry {
  let n = seed * 9301 + 49297;
  const rnd = () => ((n = (n * 9301 + 49297) % 233280) / 233280);

  const halfW = width / 2;
  const jag = () => (rnd() - 0.5) * 0.34;
  const shape = new Shape();
  shape.moveTo(-halfW, -depth / 2);
  shape.lineTo(-halfW + 0.2 + jag(), depth / 2 + jag() * 0.4);
  shape.lineTo(-halfW * 0.35 + jag(), depth / 2 + 0.1 + jag() * 0.5);
  shape.lineTo(halfW * 0.3 + jag(), depth / 2 + jag() * 0.5);
  shape.lineTo(halfW - 0.15 + jag(), depth / 2 - 0.05 + jag() * 0.4);
  shape.lineTo(halfW, -depth / 2 + 0.12);
  shape.closePath();

  const geo = new ExtrudeGeometry(shape, {
    depth: 0.34,
    bevelEnabled: true,
    bevelThickness: 0.07,
    bevelSize: 0.06,
    bevelSegments: 1,
  });
  // Extrude builds on XY; lay it flat so the extrusion becomes thickness.
  geo.rotateX(-Math.PI / 2);
  return geo;
}

/** A frond of kelp, swaying is handled by the caller. */
function kelpBlade(seed: number): ExtrudeGeometry {
  let n = seed * 4801 + 9311;
  const rnd = () => ((n = (n * 9301 + 49297) % 233280) / 233280);
  const height = 0.85 + rnd() * 1.15;
  const shape = new Shape();
  shape.moveTo(-0.1, 0);
  shape.quadraticCurveTo(-0.26, height * 0.5, -0.06, height);
  shape.quadraticCurveTo(0.09, height * 0.5, 0.1, 0);
  shape.closePath();
  return new ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: false, curveSegments: 5 });
}

export function buildBoard(state: GameState): BoardView {
  const root = new Group();
  const ledges: LedgeView[] = [];
  const targets: Mesh[] = [];
  const nameplates: BoardView['nameplates'] = [];
  const walls: WallView[] = [];
  const kelp: BoardView['kelp'] = [];
  const treasureLabels: BoardView['treasureLabels'] = [];
  const count = state.trenches.length;
  const maxDepth = Math.max(...state.trenches.map((t) => t.depth));

  for (const trench of state.trenches) {
    const x = trenchX(trench.id, count);
    const wallHeight = trench.depth * LEDGE_DROP + 2.6;

    // Back wall of the shaft. Darkens with depth so the floor reads as deep.
    const wall = new Mesh(
      new PlaneGeometry(LEDGE_WIDTH + 1.6, wallHeight, 1, 8),
      new MeshStandardMaterial({
        map: rockFace(trench.id + 1),
        // A textured material multiplies map by colour, so tinting rock with a
        // dark rock colour compounded to near-black. The texture carries the
        // hue; the colour only trims it.
        color: new Color(0xd6ecf5),
        roughness: 1,
        metalness: 0,
        side: DoubleSide,
      }),
    );
    wall.position.set(x, -wallHeight / 2 + 1.6, -1.5);
    root.add(wall);
    const flankMeshes: Mesh[] = [];

    // Side walls turn the flat backdrop into a shaft with real depth.
    for (const side of [-1, 1]) {
      const flank = new Mesh(
        new PlaneGeometry(3.4, wallHeight, 1, 6),
        new MeshStandardMaterial({
          map: rockFace(trench.id * 7 + (side > 0 ? 3 : 5)),
          // Flanks sit a shade back from the face they flank.
          color: new Color(0x8fb6c6),
          roughness: 1,
          side: DoubleSide,
        }),
      );
      flank.position.set(x + side * (LEDGE_WIDTH / 2 + 0.8), -wallHeight / 2 + 1.6, 0.15);
      flank.rotation.y = side * -Math.PI * 0.42;
      root.add(flank);
      flankMeshes.push(flank);
    }
    walls.push({ mesh: wall, flanks: flankMeshes, builtHeight: wallHeight, depth: trench.depth });

    const label = new Sprite(
      new SpriteMaterial({ map: nameplate(trench.name, `depth ${trench.depth}`, false), depthWrite: false, fog: false }),
    );
    label.position.set(x, NAMEPLATE_Y, 1.2);
    label.scale.set(5.0, 1.56, 1);
    root.add(label);
    nameplates.push({ trench: trench.id, sprite: label });

    // A fringe of kelp around the mouth of the shaft.
    const kelpBlades = kelp;
    for (let blade = 0; blade < 9; blade++) {
      const kelp = new Mesh(
        kelpBlade(trench.id * 11 + blade),
        new MeshStandardMaterial({
          color: blade % 3 === 0 ? 0x4f8f5c : blade % 3 === 1 ? 0x37784f : 0x2b6146,
          roughness: 1,
          side: DoubleSide,
        }),
      );
      const across = (blade / 8 - 0.5) * (LEDGE_WIDTH + 1.9);
      kelp.position.set(x + across, -1.35, LEDGE_DEPTH * 0.75);
      kelp.rotation.z = (blade - 4) * 0.09;
      kelp.rotation.y = blade * 0.4;
      root.add(kelp);
      kelpBlades.push({ mesh: kelp, phase: trench.id * 2.1 + blade * 0.7, lean: (blade - 4) * 0.09 });
    }

    for (let ledge = 1; ledge <= trench.depth; ledge++) {
      const y = ledgeY(ledge);
      const isWreck = ledge === trench.depth;
      const group = new Group();
      group.position.set(x, y, 0);

      const shelf = new Mesh(
        rockSlab(trench.id * 31 + ledge, LEDGE_WIDTH, LEDGE_DEPTH),
        new MeshStandardMaterial({
          color: new Color(depthMix(LEDGE, LEDGE_DEEP, ledge / maxDepth)),
          roughness: 0.95,
          flatShading: true,
          emissive: new Color(0x000000),
        }),
      );
      shelf.position.y = -0.42;
      group.add(shelf);

      const lip = new Mesh(
        new BoxGeometry(LEDGE_WIDTH * 0.97, 0.085, 0.085),
        new MeshBasicMaterial({ color: 0xa8e4f5, transparent: true, opacity: 0.66 }),
      );
      lip.position.set(0, -0.09, LEDGE_DEPTH / 2 + 0.05);
      group.add(lip);

      // Coral nubs clinging to the outcrop — small, but they break the
      // repetition that made every shelf look machined.
      const coralSeed = trench.id * 17 + ledge * 5;
      for (let n = 0; n < 3; n++) {
        const t = ((coralSeed + n * 7) % 13) / 13;
        const nub = new Mesh(
          new BoxGeometry(0.13 + t * 0.14, 0.18 + t * 0.34, 0.12 + t * 0.12),
          new MeshStandardMaterial({
            color: n % 2 ? 0xe07f68 : 0x7fd4b6,
            roughness: 1,
            flatShading: true,
          }),
        );
        nub.position.set(-LEDGE_WIDTH / 2 + 0.5 + t * (LEDGE_WIDTH - 1.2), -0.2, LEDGE_DEPTH / 2 - 0.35 - t * 0.5);
        nub.rotation.set(t * 0.4, t * 2.4, t * 0.3);
        group.add(nub);
      }

      // Cost plate, mounted at the near edge where the camera can read it.
      const plate = new Sprite(
        new SpriteMaterial({ map: costPlate(trench.costs[ledge - 1], false), depthWrite: false, fog: false }),
      );
      // In front of the shelf box, or the shelf clips the bottom of the digit.
      plate.position.set(-LEDGE_WIDTH / 2 + 0.7, -0.1, LEDGE_DEPTH / 2 + 0.5);
      plate.scale.set(1.15, 1.15, 1);
      group.add(plate);

      if (isWreck) {
        // A broken hull lying on its side, ribs showing, not a crate.
        const hullShape = new Shape();
        hullShape.moveTo(-1.5, -0.32);
        hullShape.quadraticCurveTo(-1.75, 0.18, -1.2, 0.44);
        hullShape.lineTo(1.25, 0.5);
        hullShape.quadraticCurveTo(1.72, 0.3, 1.5, -0.3);
        hullShape.quadraticCurveTo(0, -0.62, -1.5, -0.32);
        const hull = new Mesh(
          new ExtrudeGeometry(hullShape, {
            depth: LEDGE_DEPTH * 0.72,
            bevelEnabled: true,
            bevelThickness: 0.06,
            bevelSize: 0.05,
            bevelSegments: 1,
            curveSegments: 8,
          }),
          new MeshStandardMaterial({ color: 0x2f2a1c, roughness: 1, flatShading: true }),
        );
        hull.position.set(0.2, -0.02, -LEDGE_DEPTH * 0.36);
        hull.rotation.z = -0.07;
        group.add(hull);

        for (let rib = -1; rib <= 1; rib++) {
          const timber = new Mesh(
            new BoxGeometry(0.09, 0.82, LEDGE_DEPTH * 0.78),
            new MeshStandardMaterial({ color: 0x413826, roughness: 1 }),
          );
          timber.position.set(0.2 + rib * 0.85, 0.06, 0);
          timber.rotation.z = -0.07;
          group.add(timber);
        }

        const glow = new Mesh(
          new BoxGeometry(LEDGE_WIDTH * 0.36, 0.16, 0.7),
          new MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.55 }),
        );
        glow.position.set(0.2, 0.5, 0.3);
        group.add(glow);

        const stash = new Sprite(new SpriteMaterial({ depthWrite: false, fog: false }));
        stash.position.set(0, 0.95, 1.2);
        stash.scale.set(4.0, 1.25, 1);
        group.add(stash);
        treasureLabels.push({ trench: trench.id, sprite: stash });
      }

      const line = new Mesh(
        new BoxGeometry(1, 0.055, 0.055),
        new MeshBasicMaterial({ color: 0xbfe6f2, transparent: true, opacity: 0.72 }),
      );
      line.position.set(DIVER_ROW_OFFSET, 0.34, 0.3);
      line.visible = false;
      group.add(line);

      // Generous invisible hit box — clicking a thin shelf is miserable.
      const target = new Mesh(
        new BoxGeometry(LEDGE_WIDTH + 0.9, 2.0, LEDGE_DEPTH + 1.6),
        new MeshBasicMaterial({ visible: false }),
      );
      target.position.set(x, y - 0.1, 0.2);
      target.userData = { trench: trench.id, ledge };
      root.add(target);
      targets.push(target);

      root.add(group);
      ledges.push({ trench: trench.id, ledge, shelf, plate, line, group, isWreck });
    }
  }

  const surface = new Mesh(
    new PlaneGeometry(count * 9.5, 26, 1, 1),
    new MeshStandardMaterial({
      map: surfaceShimmer(),
      color: 0x6fd9f2,
      transparent: true,
      opacity: 0.16,
      roughness: 0.3,
      side: DoubleSide,
    }),
  );
  surface.rotation.x = -Math.PI / 2;
  surface.position.set(0, SURFACE_Y + 3.4, 2);
  root.add(surface);

  const index = new Map<string, LedgeView>();
  for (const l of ledges) index.set(`${l.trench}:${l.ledge}`, l);

  return {
    root,
    ledges,
    targets,
    nameplates,
    treasureLabels,
    kelp,
    ledgeAt: (trench, ledge) => index.get(`${trench}:${ledge}`),
    relayout() {
      for (const ledge of ledges) ledge.group.position.y = ledgeY(ledge.ledge);
      for (const target of targets) {
        const { ledge } = target.userData as { ledge: number };
        target.position.y = ledgeY(ledge) - 0.1;
      }
      for (const { sprite } of nameplates) sprite.position.y = NAMEPLATE_Y;
      for (const wall of walls) {
        const height = wall.depth * LEDGE_DROP + 2.6;
        const scale = height / wall.builtHeight;
        wall.mesh.scale.y = scale;
        wall.mesh.position.y = -height / 2 + 1.6;
        for (const flank of wall.flanks) {
          flank.scale.y = scale;
          flank.position.y = -height / 2 + 1.6;
        }
      }
    },
  };
}

export function disposeObject(object: Object3D): void {
  object.traverse((child) => {
    const mesh = child as Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) material.forEach((m) => m.dispose());
    else if (material) material.dispose();
  });
}
