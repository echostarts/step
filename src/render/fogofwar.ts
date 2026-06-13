import * as THREE from 'three';
import { CELL } from './scene';

/**
 * Туман войны: канвас-текстура над полом. Неразведанное — чёрное,
 * разведанное вне LOS — затемнено. Видимость юнитов решает BattleScene.
 */
export class FogOfWar {
  plane: THREE.Mesh;
  explored = new Set<string>();
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private tex: THREE.CanvasTexture;
  private res = 8; // пикселей на клетку — мягкие края

  constructor(
    private w: number,
    private h: number,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = w * this.res;
    this.canvas.height = h * this.res;
    this.ctx = this.canvas.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.NoColorSpace;
    const geo = new THREE.PlaneGeometry(w * CELL, h * CELL);
    const mat = new THREE.MeshBasicMaterial({
      map: this.tex,
      transparent: true,
      depthWrite: false,
    });
    this.plane = new THREE.Mesh(geo, mat);
    this.plane.rotation.x = -Math.PI / 2;
    // центр карты: клетка (0,0) центрируется в (0,0), поэтому смещение на половину
    this.plane.position.set(((w - 1) * CELL) / 2, 0.12, ((h - 1) * CELL) / 2);
    this.plane.renderOrder = 5;
  }

  update(visible: Set<string>): void {
    for (const k of visible) this.explored.add(k);
    const ctx = this.ctx;
    const r = this.res;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = 'rgba(2,4,8,0.96)';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    // разведанное — полупрозрачно
    ctx.globalCompositeOperation = 'source-over';
    for (const k of this.explored) {
      if (visible.has(k)) continue;
      const [x, y] = k.split(',').map(Number);
      ctx.clearRect(x * r, y * r, r, r);
    }
    for (const k of this.explored) {
      if (visible.has(k)) continue;
      const [x, y] = k.split(',').map(Number);
      ctx.fillStyle = 'rgba(4,7,12,0.62)';
      ctx.fillRect(x * r, y * r, r, r);
    }
    // видимое — прозрачно
    for (const k of visible) {
      const [x, y] = k.split(',').map(Number);
      ctx.clearRect(x * r, y * r, r, r);
    }
    // мягкие края: лёгкое размытие через downscale-трюк не делаем — дешевле блюр фильтром
    this.tex.needsUpdate = true;
  }

  isVisible(x: number, y: number, visible: Set<string>): boolean {
    return visible.has(x + ',' + y);
  }

  serialize(): string[] {
    return [...this.explored];
  }

  restore(keys: string[]): void {
    this.explored = new Set(keys);
  }
}
