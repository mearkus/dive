import {
  AmbientLight,
  Clock,
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Vector2,
  WebGLRenderer,
  type Object3D,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { WATER_DEEP, WATER_SHALLOW } from './palette.js';
import { waterBackdrop } from './textures.js';
import { fitDistance, frameFor } from './layout.js';

export type Quality = 'low' | 'medium' | 'high';

export interface Stage {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  controls: OrbitControls;
  raycaster: Raycaster;
  pick(event: PointerEvent, objects: Object3D[]): Object3D | null;
  onFrame(fn: (t: number, dt: number) => void): void;
  start(): void;
}

/** Pick a quality tier from what the device admits to. */
export function detectQuality(): Quality {
  const cores = navigator.hardwareConcurrency ?? 4;
  const mobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  if (mobile || cores <= 4) return 'low';
  return cores >= 8 ? 'high' : 'medium';
}

export function createStage(canvas: HTMLCanvasElement, trenchCount: number, maxDepth: number, quality: Quality): Stage {
  const renderer = new WebGLRenderer({ canvas, antialias: quality !== 'low', powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === 'high' ? 2 : 1.5));

  const scene = new Scene();
  scene.fog = new FogExp2(WATER_DEEP, 0.021);
  scene.background = waterBackdrop();

  const frame = frameFor(trenchCount, maxDepth);
  const camera = new PerspectiveCamera(52, 1, 0.1, 300);
  camera.position.set(0, frame.center.y + 6.5, frame.distance);


  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(frame.center.x, frame.center.y, frame.center.z);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 10;
  controls.maxDistance = 220;
  controls.maxPolarAngle = Math.PI * 0.62;
  controls.minPolarAngle = Math.PI * 0.16;
  controls.enablePan = false;
  controls.update();

  scene.add(new HemisphereLight(WATER_SHALLOW, 0x04121a, 1.15));
  scene.add(new AmbientLight(0x2e6f86, 0.55));
  const sun = new DirectionalLight(0xaef0ff, 1.5);
  sun.position.set(3, 24, 12);
  scene.add(sun);
  const fill = new DirectionalLight(0x2a7f9e, 0.5);
  fill.position.set(-8, -6, 10);
  scene.add(fill);

  const raycaster = new Raycaster();
  const pointer = new Vector2();

  /** How much of the viewport the fixed UI actually occupies right now. */
  function chromeFraction(): number {
    const height = window.innerHeight;
    const measure = (id: string) => document.getElementById(id)?.getBoundingClientRect().height ?? 0;
    return (measure('hud') + measure('tray') + 26) / Math.max(1, height);
  }

  function resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();

    // Re-frame so the whole board fits this viewport, keeping the direction
    // the player has orbited to.
    const distance = fitDistance(camera.fov, camera.aspect, trenchCount, maxDepth, chromeFraction());
    const direction = camera.position.clone().sub(controls.target).normalize();
    camera.position.copy(controls.target).addScaledVector(direction, distance);
    controls.update();
  }
  window.addEventListener('resize', resize);
  resize();

  const callbacks: ((t: number, dt: number) => void)[] = [];
  const clock = new Clock();

  return {
    renderer,
    scene,
    camera,
    controls,
    raycaster,
    pick(event, objects) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(objects, true);
      return hits.length > 0 ? hits[0].object : null;
    },
    onFrame(fn) {
      callbacks.push(fn);
    },
    start() {
      renderer.setAnimationLoop(() => {
        const dt = Math.min(0.05, clock.getDelta());
        const t = clock.getElapsedTime();
        controls.update();
        for (const fn of callbacks) fn(t, dt);
        renderer.render(scene, camera);
      });
    },
  };
}
