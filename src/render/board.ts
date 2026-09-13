import {
  BoxGeometry,
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
import { GOLD, LEDGE, ROCK, ROCK_LIT, depthMix } from './palette.js';
import { costPlate, nameplate, rockFace, surfaceShimmer } from './textures.js';
import { LEDGE_DEPTH, LEDGE_DROP, LEDGE_WIDTH, NAMEPLATE_Y, SURFACE_Y, ledgeY, trenchX } from './layout.js';

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

export interface BoardView {
  root: Group;
  ledges: LedgeView[];
  /** Invisible fat boxes used for picking — easier to hit than the shelves. */
  targets: Mesh[];
  nameplates: { trench: number; sprite: Sprite }[];
  treasureLabels: { trench: number; sprite: Sprite }[];
  ledgeAt(trench: number, ledge: number): LedgeView | undefined;
}

export function buildBoard(state: GameState): BoardView {
  const root = new Group();
  const ledges: LedgeView[] = [];
  const targets: Mesh[] = [];
  const nameplates: BoardView['nameplates'] = [];
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
        color: new Color(depthMix(ROCK_LIT, ROCK, 0.05)),
        roughness: 1,
        metalness: 0,
        side: DoubleSide,
      }),
    );
    wall.position.set(x, -wallHeight / 2 + 1.6, -1.5);
    root.add(wall);

    // Side walls turn the flat backdrop into a shaft with real depth.
    for (const side of [-1, 1]) {
      const flank = new Mesh(
        new PlaneGeometry(3.4, wallHeight, 1, 6),
        new MeshStandardMaterial({
          map: rockFace(trench.id * 7 + (side > 0 ? 3 : 5)),
          color: new Color(depthMix(ROCK_LIT, ROCK, 0.55)),
          roughness: 1,
          side: DoubleSide,
        }),
      );
      flank.position.set(x + side * (LEDGE_WIDTH / 2 + 0.8), -wallHeight / 2 + 1.6, 0.15);
      flank.rotation.y = side * -Math.PI * 0.42;
      root.add(flank);
    }

    const label = new Sprite(
      new SpriteMaterial({ map: nameplate(trench.name, `depth ${trench.depth}`, false), depthWrite: false, fog: false }),
    );
    label.position.set(x, NAMEPLATE_Y, 1.2);
    label.scale.set(5.0, 1.56, 1);
    root.add(label);
    nameplates.push({ trench: trench.id, sprite: label });

    for (let ledge = 1; ledge <= trench.depth; ledge++) {
      const y = ledgeY(ledge);
      const isWreck = ledge === trench.depth;
      const group = new Group();
      group.position.set(x, y, 0);

      const shelf = new Mesh(
        new BoxGeometry(LEDGE_WIDTH, 0.34, LEDGE_DEPTH),
        new MeshStandardMaterial({
          color: new Color(depthMix(LEDGE, ROCK, ledge / maxDepth)),
          roughness: 0.9,
          emissive: new Color(0x000000),
        }),
      );
      shelf.position.y = -0.42;
      group.add(shelf);

      // Cost plate, mounted at the near edge where the camera can read it.
      const plate = new Sprite(
        new SpriteMaterial({ map: costPlate(trench.costs[ledge - 1], false), depthWrite: false, fog: false }),
      );
      plate.position.set(-LEDGE_WIDTH / 2 - 0.55, -0.3, 0.9);
      plate.scale.set(1.15, 1.15, 1);
      group.add(plate);

      if (isWreck) {
        const hull = new Mesh(
          new BoxGeometry(LEDGE_WIDTH * 0.62, 0.8, LEDGE_DEPTH * 0.8),
          new MeshStandardMaterial({ color: 0x2a2419, roughness: 1 }),
        );
        hull.position.set(0.2, -0.05, 0);
        hull.rotation.z = -0.09;
        group.add(hull);

        const glow = new Mesh(
          new BoxGeometry(LEDGE_WIDTH * 0.4, 0.22, 0.9),
          new MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.8 }),
        );
        glow.position.set(0.2, 0.42, 0.35);
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
      line.position.set(0, 0.34, 0.3);
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
    ledgeAt: (trench, ledge) => index.get(`${trench}:${ledge}`),
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
