/**
 * M0 scaffold: proves the build pipeline and nothing more. The scene is a
 * lit seafloor plane under exponential fog so the depth-mood work in M2
 * (DESIGN.md §7.2) has somewhere to start.
 *
 * The game logic is already complete and playable — see `npm run play`.
 */
import {
  AmbientLight,
  Clock,
  DirectionalLight,
  FogExp2,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  WebGLRenderer,
} from 'three';

const WATER = 0x0a2a3a;

const canvas = document.querySelector<HTMLCanvasElement>('#stage');
if (!canvas) throw new Error('missing #stage canvas');

const renderer = new WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new Scene();
scene.fog = new FogExp2(WATER, 0.035);

const camera = new PerspectiveCamera(55, 1, 0.1, 400);
camera.position.set(0, 6, 22);
camera.lookAt(0, 0, 0);

const seafloor = new Mesh(
  new PlaneGeometry(200, 200),
  new MeshStandardMaterial({ color: 0x123a44, roughness: 1 }),
);
seafloor.rotation.x = -Math.PI / 2;
seafloor.position.y = -4;
scene.add(seafloor);

scene.add(new AmbientLight(0x2b6f86, 1.1));
const sun = new DirectionalLight(0x9fe6ff, 1.4);
sun.position.set(4, 20, 8);
scene.add(sun);

function resize(): void {
  const { clientWidth: w, clientHeight: h } = document.documentElement;
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(h, 1);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const clock = new Clock();
renderer.setAnimationLoop(() => {
  const t = clock.getElapsedTime();
  camera.position.y = 6 + Math.sin(t * 0.4) * 0.35;
  camera.lookAt(0, 0, 0);
  renderer.render(scene, camera);
});
