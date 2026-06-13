import * as THREE from 'three';
import type { Grid } from '../game/grid';
import { neighbors4 } from '../game/grid';
import type { Vec2 } from '../game/types';
import { CELL } from './scene';

/**
 * Тактическая разметка: зоны досягаемости (декали с градацией «хватит ли
 * ОД на атаку»), пунктир пути, щитки укрытий, маркер клетки под курсором.
 * Всё — полупрозрачные декали, чтобы читалось и не ломало картинку.
 */
export class TacticalOverlay {
  group = new THREE.Group();
  private reachMesh: THREE.InstancedMesh | null = null;
  private pathDots: THREE.InstancedMesh | null = null;
  private coverMarks: THREE.Group = new THREE.Group();
  private hoverMesh: THREE.Mesh;
  private aoeMesh: THREE.Group = new THREE.Group();

  constructor() {
    this.group.name = 'overlay';
    const hoverGeo = new THREE.PlaneGeometry(CELL * 0.96, CELL * 0.96);
    this.hoverMesh = new THREE.Mesh(
      hoverGeo,
      new THREE.MeshBasicMaterial({
        color: 0xd8e6ff,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
      }),
    );
    this.hoverMesh.rotation.x = -Math.PI / 2;
    this.hoverMesh.position.y = 0.12;
    this.hoverMesh.visible = false;
    this.group.add(this.hoverMesh, this.coverMarks, this.aoeMesh);
  }

  /** показать зону движения; canAttackAfter — клетки, откуда останутся ОД на атаку */
  showReachable(cells: Vec2[], canAttackAfter: Set<string>): void {
    this.clearReachable();
    if (!cells.length) return;
    const geo = new THREE.PlaneGeometry(CELL * 0.92, CELL * 0.92);
    const mat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      vertexColors: false,
    });
    const inst = new THREE.InstancedMesh(geo, mat, cells.length);
    const m = new THREE.Matrix4();
    const rot = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
    const cBlue = new THREE.Color(0x4f7fb8); // дойти
    const cGold = new THREE.Color(0x86b8ff); // дойти и атаковать
    cells.forEach((c, i) => {
      m.copy(rot).setPosition(c.x * CELL, 0.1, c.y * CELL);
      inst.setMatrixAt(i, m);
      inst.setColorAt(i, canAttackAfter.has(c.x + ',' + c.y) ? cGold : cBlue);
    });
    inst.instanceMatrix.needsUpdate = true;
    inst.frustumCulled = false;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    this.reachMesh = inst;
    this.group.add(inst);
  }

  clearReachable(): void {
    if (this.reachMesh) {
      this.reachMesh.removeFromParent();
      this.reachMesh.geometry.dispose();
      this.reachMesh = null;
    }
  }

  /** пунктир пути */
  showPath(path: Vec2[]): void {
    this.clearPath();
    if (!path.length) return;
    const geo = new THREE.CircleGeometry(0.16, 12);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xcfe2ff,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    });
    const inst = new THREE.InstancedMesh(geo, mat, path.length);
    const m = new THREE.Matrix4();
    const rot = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
    path.forEach((c, i) => {
      m.copy(rot).setPosition(c.x * CELL, 0.13, c.y * CELL);
      inst.setMatrixAt(i, m);
    });
    inst.instanceMatrix.needsUpdate = true;
    inst.frustumCulled = false;
    this.pathDots = inst;
    this.group.add(inst);
  }

  clearPath(): void {
    if (this.pathDots) {
      this.pathDots.removeFromParent();
      this.pathDots.geometry.dispose();
      this.pathDots = null;
    }
  }

  /** щитки укрытий у кромок клетки (как в XCOM) */
  showCoverMarks(grid: Grid, cell: Vec2): void {
    this.clearCoverMarks();
    for (const n of neighbors4(cell)) {
      const cv = grid.coverValue(n.x, n.y);
      if (cv === 'none') continue;
      const mark = makeShieldMark(cv === 'full');
      const dx = n.x - cell.x;
      const dy = n.y - cell.y;
      mark.position.set(cell.x * CELL + dx * CELL * 0.42, 0.55, cell.y * CELL + dy * CELL * 0.42);
      mark.rotation.y = Math.atan2(dx, dy);
      this.coverMarks.add(mark);
    }
  }

  clearCoverMarks(): void {
    while (this.coverMarks.children.length) {
      const c = this.coverMarks.children[0];
      this.coverMarks.remove(c);
    }
  }

  setHover(cell: Vec2 | null, attackable = false): void {
    if (!cell) {
      this.hoverMesh.visible = false;
      return;
    }
    this.hoverMesh.visible = true;
    this.hoverMesh.position.set(cell.x * CELL, 0.12, cell.y * CELL);
    (this.hoverMesh.material as THREE.MeshBasicMaterial).color.set(
      attackable ? 0xff7a5c : 0xd8e6ff,
    );
  }

  /** превью области взрыва 3×3 */
  showAoe(center: Vec2 | null, size = 3): void {
    while (this.aoeMesh.children.length) this.aoeMesh.remove(this.aoeMesh.children[0]);
    if (!center) return;
    const half = Math.floor(size / 2);
    const geo = new THREE.PlaneGeometry(CELL * 0.9, CELL * 0.9);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff6633,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    });
    for (let y = -half; y <= half; y++) {
      for (let x = -half; x <= half; x++) {
        const m = new THREE.Mesh(geo, mat);
        m.rotation.x = -Math.PI / 2;
        m.position.set((center.x + x) * CELL, 0.12, (center.y + y) * CELL);
        this.aoeMesh.add(m);
      }
    }
  }

  clearAll(): void {
    this.clearReachable();
    this.clearPath();
    this.clearCoverMarks();
    this.setHover(null);
    this.showAoe(null);
  }
}

let shieldTexHalf: THREE.Texture | null = null;
let shieldTexFull: THREE.Texture | null = null;

function shieldTexture(full: boolean): THREE.Texture {
  const cached = full ? shieldTexFull : shieldTexHalf;
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.strokeStyle = full ? '#ffd789' : '#9fc3ff';
  ctx.fillStyle = full ? 'rgba(255,205,120,0.85)' : 'rgba(140,180,255,0.55)';
  ctx.lineWidth = 4;
  // силуэт щита
  ctx.beginPath();
  ctx.moveTo(32, 6);
  ctx.quadraticCurveTo(54, 10, 54, 26);
  ctx.quadraticCurveTo(54, 46, 32, 58);
  ctx.quadraticCurveTo(10, 46, 10, 26);
  ctx.quadraticCurveTo(10, 10, 32, 6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if (!full) {
    ctx.fillStyle = 'rgba(10,14,22,0.55)';
    ctx.fillRect(0, 32, 64, 32);
  }
  const tex = new THREE.CanvasTexture(c);
  if (full) shieldTexFull = tex;
  else shieldTexHalf = tex;
  return tex;
}

function makeShieldMark(full: boolean): THREE.Object3D {
  const mat = new THREE.SpriteMaterial({
    map: shieldTexture(full),
    transparent: true,
    depthWrite: false,
  });
  const s = new THREE.Sprite(mat);
  s.scale.setScalar(0.55);
  return s;
}
