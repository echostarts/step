import * as THREE from 'three';
import type { MapView } from './mapview';

/**
 * Просветка стен: стены между камерой и бойцами плавно становятся
 * полупрозрачными. Рейкаст дросселирован, опасити сглаживается покадрово.
 */
export class WallFader {
  private meshList: THREE.Mesh[] | null = null;
  private wanted = new Set<THREE.Material>();
  private faded = new Map<THREE.Material, number>();
  private lastCheck = 0;
  private raycaster = new THREE.Raycaster();

  constructor(private mapView: MapView) {}

  update(camera: THREE.Camera, targets: THREE.Vector3[]): void {
    const now = performance.now();
    if (now - this.lastCheck > 140) {
      this.lastCheck = now;
      if (!this.meshList) {
        this.meshList = [];
        for (const parts of this.mapView.wallMeshes.values())
          for (const part of parts)
            part.traverse((o) => {
              const mesh = o as THREE.Mesh;
              if (mesh.isMesh) {
                // материал должен быть уникальным, чтобы гасить только эту стену
                if (!(mesh.userData.fadeOwned as boolean)) {
                  mesh.material = (mesh.material as THREE.Material).clone();
                  mesh.userData.fadeOwned = true;
                }
                this.meshList!.push(mesh);
              }
            });
      }
      this.wanted.clear();
      const camPos = (camera as THREE.OrthographicCamera).position;
      for (const t of targets) {
        const target = t.clone().add(new THREE.Vector3(0, 1.2, 0));
        const dir = target.clone().sub(camPos).normalize();
        this.raycaster.set(camPos, dir);
        this.raycaster.far = target.distanceTo(camPos) - 1.2;
        const hits = this.raycaster.intersectObjects(this.meshList, false);
        for (const h of hits) {
          if (!h.object.visible) continue;
          const mesh = h.object as THREE.Mesh;
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const m of mats) this.wanted.add(m);
        }
      }
      this.raycaster.far = Infinity;
    }
    for (const m of this.wanted) {
      const cur = this.faded.get(m) ?? 1;
      const next = Math.max(0.22, cur - 0.12);
      this.faded.set(m, next);
      applyFade(m, next);
    }
    for (const [m, cur] of this.faded) {
      if (this.wanted.has(m)) continue;
      const next = Math.min(1, cur + 0.08);
      applyFade(m, next);
      if (next >= 1) this.faded.delete(m);
      else this.faded.set(m, next);
    }
  }
}

function applyFade(m: THREE.Material, opacity: number): void {
  m.transparent = opacity < 1;
  m.opacity = opacity;
  m.depthWrite = opacity >= 0.6;
}
