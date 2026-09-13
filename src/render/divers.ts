import {
  CapsuleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three';
import { PLAYER_COLORS, PLAYER_CSS } from './palette.js';
import { diverBadge } from './textures.js';

export interface DiverView {
  id: string;
  owner: number;
  group: Group;
  badge: Sprite;
  lamp: Mesh;
  /** Where the diver is heading; the render loop eases toward it. */
  target: Vector3;
  bobPhase: number;
  surfaced: boolean;
}

const BODY = new CapsuleGeometry(0.19, 0.34, 4, 10);
const TANK = new CylinderGeometry(0.08, 0.08, 0.32, 8);
const MASK = new SphereGeometry(0.115, 10, 8);
const FIN = new ConeGeometry(0.12, 0.26, 6);
const LAMP = new ConeGeometry(0.3, 1.5, 10, 1, true);

export function buildDiver(id: string, owner: number): DiverView {
  const group = new Group();
  // Divers read as specks at board distance without this.
  group.scale.setScalar(1.45);
  const color = PLAYER_COLORS[owner % PLAYER_COLORS.length];

  const suit = new Mesh(
    BODY,
    new MeshStandardMaterial({ color: new Color(color), roughness: 0.55, metalness: 0.1 }),
  );
  suit.rotation.x = 0.22;
  group.add(suit);

  const tank = new Mesh(TANK, new MeshStandardMaterial({ color: 0x9aa7ad, roughness: 0.5, metalness: 0.5 }));
  tank.position.set(0, 0.02, -0.2);
  tank.rotation.x = 0.22;
  group.add(tank);

  const mask = new Mesh(MASK, new MeshStandardMaterial({ color: 0x0d2b36, roughness: 0.2, metalness: 0.3 }));
  mask.position.set(0, 0.3, 0.07);
  group.add(mask);

  const fin = new Mesh(FIN, new MeshStandardMaterial({ color: new Color(color), roughness: 0.7 }));
  fin.position.set(0, -0.37, -0.1);
  fin.rotation.x = Math.PI;
  group.add(fin);

  // Unlit cone standing in for a real spotlight — lights are the perf cliff.
  const lamp = new Mesh(
    LAMP,
    new MeshBasicMaterial({ color: 0xcdf3ff, transparent: true, opacity: 0.09, depthWrite: false }),
  );
  lamp.position.set(0, 0.05, 0.92);
  lamp.rotation.x = Math.PI / 2;
  group.add(lamp);

  const badge = new Sprite(
    new SpriteMaterial({
      map: diverBadge(String.fromCharCode(65 + owner), PLAYER_CSS[owner % PLAYER_CSS.length]),
      depthWrite: false,
      depthTest: false,
      fog: false,
    }),
  );
  badge.position.set(0, 0.66, 0);
  badge.scale.set(0.5, 0.5, 1);
  group.add(badge);

  return {
    id,
    owner,
    group,
    badge,
    lamp,
    target: new Vector3(),
    bobPhase: Math.random() * Math.PI * 2,
    surfaced: false,
  };
}

/** Idle kick, so a still board is not a dead board. */
export function animateDiver(view: DiverView, t: number, eased: number): void {
  const g = view.group;
  g.position.lerp(view.target, eased);
  g.position.y += Math.sin(t * 1.6 + view.bobPhase) * 0.012;
  g.rotation.z = Math.sin(t * 1.1 + view.bobPhase) * 0.05;
}

export function setDiverDimmed(view: DiverView, dimmed: boolean): void {
  view.group.traverse((child) => {
    const mesh = child as Mesh;
    const material = mesh.material as MeshStandardMaterial | undefined;
    if (material && 'opacity' in material && mesh !== (view.badge as unknown as Mesh)) {
      material.transparent = dimmed;
      material.opacity = dimmed ? 0.28 : 1;
    }
  });
}
