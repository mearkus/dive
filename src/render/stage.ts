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
import type { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { WATER_SHALLOW } from './palette.js';
import { waterBackdrop } from './textures.js';
import { fitDistance, frameFor, verticalExtent } from './layout.js';

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

/** Pick a quality tier from what the device admits to. `?quality=` overrides. */
export function detectQuality(): Quality {
  const forced = new URLSearchParams(location.search).get('quality');
  if (forced === 'low' || forced === 'medium' || forced === 'high') return forced;
  const cores = navigator.hardwareConcurrency ?? 4;
  const mobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  if (mobile || cores <= 4) return 'low';
  return cores >= 8 ? 'high' : 'medium';
}

export function createStage(canvas: HTMLCanvasElement, trenchCount: number, maxDepth: number, quality: Quality): Stage {
  const renderer = new WebGLRenderer({ canvas, antialias: quality !== 'low', powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === 'high' ? 2 : 1.5));

  const scene = new Scene();
  // Density is set per-frame-size in resize(): see the note there.
  const fog = new FogExp2(0x0a2230, 0.0118);
  scene.fog = fog;
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

  scene.add(new HemisphereLight(WATER_SHALLOW, 0x0a1f2a, 1.55));
  scene.add(new AmbientLight(0x3a7f96, 0.78));
  const sun = new DirectionalLight(0xaef0ff, 1.75);
  sun.position.set(3, 24, 12);
  scene.add(sun);
  const fill = new DirectionalLight(0x3a92b2, 0.7);
  fill.position.set(-8, -6, 10);
  scene.add(fill);

  const raycaster = new Raycaster();
  const pointer = new Vector2();

  /**
   * Bloom on the top tier only, and deliberately restrained: a high threshold
   * so only genuinely bright things glow — lamp cones, the gold over a wreck —
   * and never the cost plates, whose legibility the whole board depends on.
   */
  let composer: EffectComposer | null = null;
  if (quality === 'high') {
    // Loaded on demand: the post-processing passes are about 45 kB, and every
    // device that will not run them should not pay to download them.
    void (async () => {
      const [{ EffectComposer: Composer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }] =
        await Promise.all([
          import('three/examples/jsm/postprocessing/EffectComposer.js'),
          import('three/examples/jsm/postprocessing/RenderPass.js'),
          import('three/examples/jsm/postprocessing/UnrealBloomPass.js'),
          import('three/examples/jsm/postprocessing/OutputPass.js'),
        ]);
      const built = new Composer(renderer);
      built.addPass(new RenderPass(scene, camera));
      built.addPass(new UnrealBloomPass(new Vector2(1, 1), 0.18, 0.25, 0.95));
      built.addPass(new OutputPass());
      built.setSize(window.innerWidth, window.innerHeight);
      composer = built;
    })();
  }

  const measure = (id: string) => document.getElementById(id)?.getBoundingClientRect().height ?? 0;

  /** Fractions of the viewport height hidden behind the HUD and the card tray. */
  function chrome(): { top: number; bottom: number } {
    const height = Math.max(1, window.innerHeight);
    return { top: (measure('hud') + 14) / height, bottom: (measure('tray') + 14) / height };
  }

  function resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    composer?.setSize(w, h);
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();

    // Re-frame so the whole board fits this viewport, keeping the direction
    // the player has orbited to.
    const { top, bottom } = chrome();
    const distance = fitDistance(camera.fov, camera.aspect, trenchCount, maxDepth, top + bottom);

    // Centre the board on the band the UI leaves visible, not on the canvas.
    // The tray is far taller than the HUD, so centring on the canvas pushed
    // the deepest ledges and their treasure behind it.
    const visible = 2 * distance * Math.tan((camera.fov * Math.PI) / 360);
    const band = (top + (1 - bottom)) / 2;
    controls.target.y = verticalExtent(maxDepth).center - visible * (0.5 - band);

    // Fog thins as the camera retreats. FogExp2 is distance-based, so fitting
    // the same board onto a narrow phone — which needs roughly twice the
    // camera distance — was washing the whole board out in proportion to how
    // small the screen was. Scaling density by distance keeps the haze looking
    // the same everywhere.
    fog.density = 0.44 / Math.max(1, distance);

    const direction = camera.position.clone().sub(controls.target).normalize();
    camera.position.copy(controls.target).addScaledVector(direction, distance);
    controls.update();
  }
  window.addEventListener('resize', resize);
  resize();

  // The tray's height is not fixed — adding the deck and discard piles made it
  // taller and quietly pushed the deepest ledges behind it. Re-frame whenever
  // the chrome changes size, not only when the window does.
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(() => resize());
    for (const id of ['tray', 'hud']) {
      const node = document.getElementById(id);
      if (node) observer.observe(node);
    }
  }

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
        if (composer) composer.render();
        else renderer.render(scene, camera);
      });
    },
  };
}
