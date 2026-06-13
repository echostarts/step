import * as THREE from 'three';

/** размер клетки в мировых единицах (родной масштаб KayKit) */
export const CELL = 2;

export function cellToWorld(x: number, y: number): THREE.Vector3 {
  return new THREE.Vector3(x * CELL, 0, y * CELL);
}

export function worldToCell(p: THREE.Vector3): { x: number; y: number } {
  return { x: Math.round(p.x / CELL), y: Math.round(p.z / CELL) };
}

/**
 * Сцена и изометрическая камера: ортография, 4 фиксированных ракурса (Q/E),
 * зум колесом, плавные перелёты. Холодная лунная гамма + ACES.
 */
export class IsoScene {
  scene = new THREE.Scene();
  camera: THREE.OrthographicCamera;
  renderer: THREE.WebGLRenderer;
  moon: THREE.DirectionalLight;

  /** центр взгляда */
  target = new THREE.Vector3();
  private targetGoal = new THREE.Vector3();
  /** ракурс 0..3 */
  quadrant = 0;
  private angleCur = Math.PI / 4;
  /** полувысота фрустума */
  zoom = 10.5;
  private zoomGoal = 10.5;

  private readonly ELEV = Math.atan(0.62); // высота камеры
  private readonly DIST = 70;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, stencil: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.28;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 220);

    // пепельно-синяя ночь
    this.scene.background = new THREE.Color(0x0b0f16);
    this.scene.fog = new THREE.FogExp2(0x10151f, 0.0095);

    // подложка под картой — мягкий уход в туман вместо жёсткого края
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(600, 600),
      new THREE.MeshStandardMaterial({ color: 0x131720, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.22;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const ambient = new THREE.AmbientLight(0x52628a, 1.05);
    this.scene.add(ambient);
    const hemi = new THREE.HemisphereLight(0x3c4d70, 0x221a12, 0.7);
    this.scene.add(hemi);

    // луна: холодный тусклый directional с мягкими тенями
    this.moon = new THREE.DirectionalLight(0xa8bedc, 1.7);
    this.moon.position.set(30, 46, 18);
    this.moon.castShadow = true;
    this.moon.shadow.mapSize.set(2048, 2048);
    this.moon.shadow.bias = -0.0004;
    this.moon.shadow.normalBias = 0.06;
    this.scene.add(this.moon);
    this.scene.add(this.moon.target);

    window.addEventListener('resize', () => this.onResize());
    this.onResize();
  }

  /** охват теней под размер карты */
  fitShadows(w: number, h: number): void {
    const cx = (w * CELL) / 2;
    const cz = (h * CELL) / 2;
    this.moon.target.position.set(cx, 0, cz);
    this.moon.position.set(cx + 26, 44, cz + 14);
    const r = Math.max(w, h) * CELL * 0.62;
    const cam = this.moon.shadow.camera;
    cam.left = -r;
    cam.right = r;
    cam.top = r;
    cam.bottom = -r;
    cam.far = 160;
    cam.updateProjectionMatrix();
  }

  rotate(dir: 1 | -1): void {
    this.quadrant = (this.quadrant + dir + 4) % 4;
  }

  setZoom(mult: number): void {
    this.zoomGoal = THREE.MathUtils.clamp(this.zoomGoal * mult, 7, 26);
  }

  lookAtCell(x: number, y: number): void {
    this.targetGoal.set(x * CELL, 0, y * CELL);
  }

  jumpToCell(x: number, y: number): void {
    this.targetGoal.set(x * CELL, 0, y * CELL);
    this.target.copy(this.targetGoal);
  }

  panWorld(dx: number, dz: number): void {
    this.targetGoal.x += dx;
    this.targetGoal.z += dz;
  }

  get angle(): number {
    return this.angleCur;
  }

  update(dt: number): void {
    const want = Math.PI / 4 + (this.quadrant * Math.PI) / 2;
    let diff = want - this.angleCur;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.angleCur += diff * Math.min(1, dt * 8);
    this.target.lerp(this.targetGoal, Math.min(1, dt * 7));
    this.zoom += (this.zoomGoal - this.zoom) * Math.min(1, dt * 8);

    const e = this.ELEV;
    const off = new THREE.Vector3(
      Math.cos(e) * Math.sin(this.angleCur),
      Math.sin(e),
      Math.cos(e) * Math.cos(this.angleCur),
    ).multiplyScalar(this.DIST);
    this.camera.position.copy(this.target).add(off);
    this.camera.lookAt(this.target);

    const aspect = window.innerWidth / window.innerHeight;
    this.camera.left = -this.zoom * aspect;
    this.camera.right = this.zoom * aspect;
    this.camera.top = this.zoom;
    this.camera.bottom = -this.zoom;
    this.camera.updateProjectionMatrix();
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  private onResize(): void {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
