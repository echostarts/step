import * as THREE from 'three';
import type { Grid } from '../game/grid';
import type { MapDef, Vec2 } from '../game/types';
import { assets } from './assets';
import { CELL, cellToWorld, type IsoScene } from './scene';

/**
 * Сборка уровня из паков KayKit: пол — обязательно инстансингом,
 * стены — отдельными мешами (для просветки, когда заслоняют бойцов),
 * декор и укрытия — по карте и списку props.
 */

type FloorVariant = { key: string; weight: number };

const FLOOR_SETS: Record<string, FloorVariant[]> = {
  '.': [
    { key: 'floor_tile_small', weight: 12 },
    { key: 'floor_tile_small_broken_A', weight: 2 },
    { key: 'floor_tile_small_broken_B', weight: 2 },
    { key: 'floor_tile_small_weeds_A', weight: 1 },
    { key: 'floor_tile_small_decorated', weight: 1 },
  ],
  ',': [
    { key: 'floor_dirt_small_A', weight: 8 },
    { key: 'floor_dirt_small_B', weight: 6 },
    { key: 'floor_dirt_small_C', weight: 4 },
    { key: 'floor_dirt_small_D', weight: 4 },
    { key: 'floor_dirt_small_weeds', weight: 2 },
  ],
  _: [
    { key: 'floor_wood_small', weight: 10 },
    { key: 'floor_wood_small_dark', weight: 2 },
  ],
};

/** детерминированный хэш клетки — чтобы пол не «мигал» между запусками */
function cellHash(x: number, y: number): number {
  let h = (x * 73856093) ^ (y * 19349663);
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}

export class MapView {
  group = new THREE.Group();
  /** стены по клеткам — для просветки */
  wallMeshes = new Map<string, THREE.Object3D[]>();
  doorObjects = new Map<string, { closed: THREE.Object3D; open: THREE.Object3D }>();
  chestCells: Vec2[] = [];
  private flickerLights: { light: THREE.PointLight; base: number; phase: number }[] = [];

  async build(iso: IsoScene, grid: Grid, def: MapDef): Promise<void> {
    this.group.name = 'map';
    await this.buildFloors(grid, def);
    await this.buildWalls(grid);
    await this.buildCovers(grid);
    await this.buildProps(def);
    this.buildLights(def);
    iso.scene.add(this.group);
    iso.fitShadows(grid.w, grid.h);
  }

  // ---------- Пол (инстансинг) ----------

  private async buildFloors(grid: Grid, def: MapDef): Promise<void> {
    // распределяем клетки по вариантам
    const byVariant = new Map<string, Vec2[]>();
    for (let y = 0; y < grid.h; y++) {
      for (let x = 0; x < grid.w; x++) {
        const ch = grid.charAt(x, y);
        let setKey: string | null = null;
        if (ch === '.' || ch === '@' || /[0-9]/.test(ch)) setKey = '.';
        else if (ch === ',') setKey = ',';
        else if (ch === '_') setKey = '_';
        else if (grid.kindAt(x, y) !== 'void') setKey = def.ambient === 'chapel' ? '.' : ',';
        if (!setKey) continue;
        // под собором — камень, под двором — земля
        const set = FLOOR_SETS[setKey];
        const total = set.reduce((s, v) => s + v.weight, 0);
        let r = cellHash(x, y) * total;
        let chosen = set[0].key;
        for (const v of set) {
          r -= v.weight;
          if (r <= 0) {
            chosen = v.key;
            break;
          }
        }
        let arr = byVariant.get(chosen);
        if (!arr) byVariant.set(chosen, (arr = []));
        arr.push({ x, y });
      }
    }

    for (const [key, cells] of byVariant) {
      const meshes = await assets.dungeonRaw(key);
      for (const src of meshes) {
        const inst = new THREE.InstancedMesh(src.geometry, src.material, cells.length);
        inst.receiveShadow = true;
        const m = new THREE.Matrix4();
        const rot = new THREE.Matrix4();
        cells.forEach((c, i) => {
          const r = Math.floor(cellHash(c.x * 3 + 1, c.y * 7 + 3) * 4);
          rot.makeRotationY((r * Math.PI) / 2);
          m.copy(rot).setPosition(c.x * CELL, 0, c.y * CELL);
          inst.setMatrixAt(i, m);
        });
        inst.instanceMatrix.needsUpdate = true;
        this.group.add(inst);
      }
    }
  }

  // ---------- Стены ----------

  private isWallish(grid: Grid, x: number, y: number): boolean {
    const k = grid.kindAt(x, y);
    return k === 'wall' || k === 'door';
  }

  private async buildWalls(grid: Grid): Promise<void> {
    for (let y = 0; y < grid.h; y++) {
      for (let x = 0; x < grid.w; x++) {
        const k = grid.kindAt(x, y);
        if (k === 'wall') await this.placeWall(grid, x, y);
        else if (k === 'door') await this.placeDoor(grid, x, y);
      }
    }
  }

  /**
   * Автотайлинг стен из доступных кусков: для каждой стены смотрим
   * продолжения в 4 стороны и составляем клетку из полусегментов wall_half
   * (длина ровно клетка, якорь в начале) и wall_pillar на стыках.
   */
  private async placeWall(grid: Grid, x: number, y: number): Promise<void> {
    const e = this.isWallish(grid, x + 1, y);
    const w = this.isWallish(grid, x - 1, y);
    const n = this.isWallish(grid, x, y - 1);
    const s = this.isWallish(grid, x, y + 1);
    const pos = cellToWorld(x, y);
    const parts: THREE.Object3D[] = [];

    const addSeg = async (rotY: number) => {
      const seg = await assets.dungeon('wall_half');
      // wall_half: x 0..2 — половина клетки от центра до края
      seg.rotation.y = rotY;
      seg.position.copy(pos);
      parts.push(seg);
    };

    const count = [e, w, n, s].filter(Boolean).length;
    if (count === 0) {
      const p = await assets.dungeon('pillar');
      p.position.copy(pos);
      parts.push(p);
    } else {
      if (e) await addSeg(0);
      if (w) await addSeg(Math.PI);
      if (s) await addSeg(-Math.PI / 2);
      if (n) await addSeg(Math.PI / 2);
      if (count > 2 || (count === 2 && ((e || w) && (n || s)))) {
        const p = await assets.dungeon('wall_pillar');
        p.position.copy(pos);
        parts.push(p);
      }
    }
    for (const part of parts) {
      part.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        }
      });
      this.group.add(part);
    }
    this.wallMeshes.set(x + ',' + y, parts);
  }

  private async placeDoor(grid: Grid, x: number, y: number): Promise<void> {
    // ориентация по линии стены
    const horizontal = this.isWallish(grid, x + 1, y) || this.isWallish(grid, x - 1, y);
    const rotY = horizontal ? 0 : Math.PI / 2;
    const pos = cellToWorld(x, y);
    const closed = await assets.dungeon('wall_gated');
    const open = await assets.dungeon('wall_doorway');
    for (const obj of [closed, open]) {
      obj.rotation.y = rotY;
      obj.position.copy(pos);
      obj.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        }
      });
      this.group.add(obj);
    }
    open.visible = false;
    this.doorObjects.set(x + ',' + y, { closed, open });
    this.wallMeshes.set(x + ',' + y, [closed, open]);
  }

  setDoorOpen(x: number, y: number): void {
    const d = this.doorObjects.get(x + ',' + y);
    if (d) {
      d.closed.visible = false;
      d.open.visible = true;
    }
  }

  // ---------- Укрытия ----------

  /** инстансим повторяющиеся укрытия (изгороди, бочки, ящики) */
  private async buildInstancedCovers(grid: Grid): Promise<void> {
    type Placement = { m: THREE.Matrix4 };
    const fences: Placement[] = [];
    const barrels: Placement[] = [];
    const boxes: Placement[] = [];
    const m = new THREE.Matrix4();
    const ry = new THREE.Matrix4();
    const t = new THREE.Matrix4();
    for (let y = 0; y < grid.h; y++) {
      for (let x = 0; x < grid.w; x++) {
        const ch = grid.charAt(x, y);
        const jr = cellHash(x * 5 + 2, y * 11 + 7);
        const cx = x * CELL;
        const cz = y * CELL;
        if (ch === 'f') {
          const horizontal = grid.charAt(x + 1, y) === 'f' || grid.charAt(x - 1, y) === 'f';
          // barrier_half: x 0..2 -> сдвиг -1, поворот по линии
          ry.makeRotationY(horizontal ? 0 : Math.PI / 2);
          t.makeTranslation(-1, 0, 0);
          m.makeTranslation(cx, 0, cz).multiply(ry).multiply(t);
          fences.push({ m: m.clone() });
        } else if (ch === 'b') {
          for (const [dx, dz] of [
            [-0.35, -0.25],
            [0.45, 0.3],
            [-0.3, 0.5],
          ]) {
            ry.makeRotationY(jr * 6.28 + dx);
            m.makeTranslation(cx + dx, 0, cz + dz).multiply(ry);
            barrels.push({ m: m.clone() });
          }
        } else if (ch === 'x') {
          for (const [dx, dy, dz] of [
            [-0.4, 0, 0.1],
            [0.5, 0, -0.3],
            [0.05, 1.0, -0.1],
          ]) {
            ry.makeRotationY(dy > 0 ? 0.4 : jr);
            m.makeTranslation(cx + dx, dy, cz + dz).multiply(ry);
            boxes.push({ m: m.clone() });
          }
        }
      }
    }
    await this.instanceModel('barrier_half', fences);
    await this.instanceModel('barrel_small', barrels);
    await this.instanceModel('box_small', boxes);
  }

  private async instanceModel(key: string, placements: { m: THREE.Matrix4 }[]): Promise<void> {
    if (!placements.length) return;
    const meshes = await assets.dungeonRaw(key);
    for (const src of meshes) {
      const inst = new THREE.InstancedMesh(src.geometry, src.material, placements.length);
      inst.castShadow = true;
      inst.receiveShadow = true;
      // учесть локальную матрицу меша внутри модели
      const local = src.matrixWorld.clone();
      const tmp = new THREE.Matrix4();
      placements.forEach((p, i) => {
        tmp.multiplyMatrices(p.m, local);
        inst.setMatrixAt(i, tmp);
      });
      inst.instanceMatrix.needsUpdate = true;
      this.group.add(inst);
    }
  }

  private async buildCovers(grid: Grid): Promise<void> {
    // изгороди и бочки/ящики — частые повторяющиеся меши: инстансим их,
    // чтобы на карте 48×32 не плодить сотни вызовов отрисовки
    await this.buildInstancedCovers(grid);
    for (let y = 0; y < grid.h; y++) {
      for (let x = 0; x < grid.w; x++) {
        const ch = grid.charAt(x, y);
        const pos = cellToWorld(x, y);
        const jr = cellHash(x * 5 + 2, y * 11 + 7);
        let obj: THREE.Object3D | null = null;
        if (ch === 'T') {
          obj = await assets.dungeon(jr > 0.5 ? 'table_medium' : 'table_medium_broken');
        } else if (ch === 'C') {
          obj = await assets.dungeon('chest');
          obj.rotation.y = Math.PI;
          this.chestCells.push({ x, y });
        } else if (ch === 'R') {
          obj = await assets.dungeon('rubble_half');
          obj.scale.setScalar(0.5);
          obj.position.x = -1;
        }
        if (!obj) continue;
        obj.position.add(pos);
        obj.rotation.y += Math.floor(jr * 4) * 0.04 - 0.08;
        obj.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.castShadow = true;
            mesh.receiveShadow = true;
          }
        });
        this.group.add(obj);
      }
    }
  }

  // ---------- Декор и свет ----------

  private async buildProps(def: MapDef): Promise<void> {
    for (const p of def.props ?? []) {
      const obj = await assets.dungeon(p.model);
      obj.position.copy(cellToWorld(p.x, p.y));
      if (p.model.startsWith('torch_mounted')) obj.position.y = 2.2;
      obj.rotation.y = ((p.rot ?? 0) * Math.PI) / 2;
      if (p.s) obj.scale.setScalar(p.s);
      obj.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        }
      });
      this.group.add(obj);
    }
  }

  private buildLights(def: MapDef): void {
    const glowTex = makeGlowTexture();
    for (const l of def.lights ?? []) {
      const pos = cellToWorld(l.x, l.y);
      const light = new THREE.PointLight(l.color ?? 0xff9944, l.intensity ?? 6, 14, 1.8);
      light.position.set(pos.x, l.h ?? 2.6, pos.z);
      this.group.add(light);
      this.flickerLights.push({
        light,
        base: light.intensity,
        phase: Math.random() * 10,
      });
      // тёплый ореол вместо bloom — только на источниках
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTex,
          color: l.color ?? 0xff9944,
          transparent: true,
          opacity: 0.35,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      sprite.scale.setScalar(3.2);
      sprite.position.copy(light.position);
      this.group.add(sprite);
    }
  }

  /** мерцание факелов */
  update(time: number): void {
    for (const f of this.flickerLights) {
      f.light.intensity =
        f.base * (0.82 + 0.18 * Math.sin(time * 9 + f.phase) * Math.sin(time * 23 + f.phase * 2));
    }
  }
}

let glowTexCache: THREE.Texture | null = null;
export function makeGlowTexture(): THREE.Texture {
  if (glowTexCache) return glowTexCache;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  glowTexCache = new THREE.CanvasTexture(c);
  return glowTexCache;
}
