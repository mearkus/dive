import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  ConeGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  type Scene,
} from 'three';
import { WATER_DEEP } from './palette.js';

export interface WaterOptions {
  /** Low quality drops particulate and light shafts. */
  quality: 'low' | 'medium' | 'high';
  depth: number;
  width: number;
}

/**
 * Depth is the mood (DESIGN.md §4.2): particulate drifting through the beam,
 * and surface light that never reaches the floor.
 */
export function buildWater(scene: Scene, options: WaterOptions): { update(t: number): void } {
  const group = new Group();
  scene.add(group);

  const shafts: Mesh[] = [];
  if (options.quality !== 'low') {
    for (let i = 0; i < 5; i++) {
      const cone = new Mesh(
        new ConeGeometry(1.6 + (i % 3) * 1.4, options.depth * 0.95, 10, 1, true),
        new MeshBasicMaterial({
          color: new Color(0x8fe9ff),
          transparent: true,
          opacity: 0.1,
          blending: AdditiveBlending,
          depthWrite: false,
        }),
      );
      cone.position.set((i - 2) * (options.width / 4.6), -options.depth * 0.24, -2.2);
      cone.rotation.z = (i - 2) * 0.03;
      group.add(cone);
      shafts.push(cone);
    }
  }

  let motes: Points | null = null;
  if (options.quality !== 'low') {
    const count = options.quality === 'high' ? 1400 : 700;
    const positions = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * options.width * 1.5;
      positions[i * 3 + 1] = -Math.random() * options.depth * 1.15 + 3;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 14;
      speeds[i] = 0.06 + Math.random() * 0.16;
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
    motes = new Points(
      geo,
      new PointsMaterial({
        color: 0xbdf0ff,
        size: 0.11,
        transparent: true,
        opacity: 0.75,
        blending: AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    );
    group.add(motes);

    // Motes drift slowly upward, wrapping at the surface.
    const attr = geo.getAttribute('position') as Float32BufferAttribute;
    let last = 0;
    return {
      update(t: number) {
        const dt = Math.min(0.05, t - last);
        last = t;
        for (let i = 0; i < count; i++) {
          let y = attr.getY(i) + speeds[i] * dt;
          if (y > 3.2) y = -options.depth * 1.15;
          attr.setY(i, y);
        }
        attr.needsUpdate = true;
        for (let i = 0; i < shafts.length; i++) {
          const m = shafts[i].material as MeshBasicMaterial;
          m.opacity = 0.085 + Math.sin(t * 0.5 + i) * 0.03;
        }
      },
    };
  }

  return { update() {} };
}

export const FOG_COLOR = WATER_DEEP;
