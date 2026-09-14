import {
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Shape,
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

/**
 * The classic meeple silhouette — round head, arms out, flared base — drawn
 * once as a 2D outline and extruded. A board game piece, not a model of a
 * person: the shape has to read at 30 pixels tall.
 */
function meepleShape(): Shape {
  const s = new Shape();
  s.moveTo(-0.45, 0);
  s.lineTo(-0.29, 0.33);
  s.quadraticCurveTo(-0.53, 0.35, -0.50, 0.50);
  s.quadraticCurveTo(-0.48, 0.61, -0.29, 0.58);
  s.quadraticCurveTo(-0.20, 0.58, -0.17, 0.66);
  // Over the top of the head, clockwise from the left shoulder to the right.
  s.absarc(0, 0.80, 0.205, 3.82, -0.68, true);
  s.quadraticCurveTo(0.20, 0.58, 0.29, 0.58);
  s.quadraticCurveTo(0.48, 0.61, 0.50, 0.50);
  s.quadraticCurveTo(0.53, 0.35, 0.29, 0.33);
  s.lineTo(0.45, 0);
  s.closePath();
  return s;
}

const BODY = new ExtrudeGeometry(meepleShape(), {
  depth: 0.26,
  bevelEnabled: true,
  bevelThickness: 0.045,
  bevelSize: 0.04,
  bevelSegments: 2,
  curveSegments: 12,
});
// Stand it up on the ledge, centred, and size it like the old capsule.
BODY.translate(0, -0.44, -0.13);
BODY.scale(0.82, 0.82, 0.82);

const TANK = new CylinderGeometry(0.075, 0.075, 0.3, 8);
const MASK = new BoxGeometry(0.3, 0.1, 0.1);
const FIN = new ConeGeometry(0.12, 0.24, 6);
const LAMP = new ConeGeometry(0.3, 1.5, 10, 1, true);

export function buildDiver(id: string, owner: number): DiverView {
  const group = new Group();
  // Divers read as specks at board distance without this.
  group.scale.setScalar(1.45);
  const color = PLAYER_COLORS[owner % PLAYER_COLORS.length];

  const suit = new Mesh(
    BODY,
    new MeshStandardMaterial({ color: new Color(color), roughness: 0.45, metalness: 0.08 }),
  );
  group.add(suit);

  // A meeple, but a diving one: tank on the back, mask across the face.
  const tank = new Mesh(TANK, new MeshStandardMaterial({ color: 0xa9b6bc, roughness: 0.4, metalness: 0.6 }));
  tank.position.set(0, 0.02, -0.17);
  group.add(tank);

  const mask = new Mesh(MASK, new MeshStandardMaterial({ color: 0x081d26, roughness: 0.15, metalness: 0.4 }));
  mask.position.set(0, 0.22, 0.12);
  group.add(mask);

  const fin = new Mesh(FIN, new MeshStandardMaterial({ color: new Color(color), roughness: 0.7 }));
  fin.position.set(0, -0.4, -0.12);
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
