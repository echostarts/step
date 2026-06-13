import * as THREE from 'three';
import { mapDef } from '../data/maps';
import { NPCS } from '../data/units';
import { Grid } from '../game/grid';
import { findPath } from '../game/pathfind';
import type { UnitState, Vec2 } from '../game/types';
import { makeUnit } from '../game/unit';
import { MapView, makeGlowTexture } from './mapview';
import { WallFader } from './wallfade';
import { CELL, type IsoScene } from './scene';
import { UnitView } from './unitview';

export interface NpcSpawn {
  defId: string;
  dialogue: string;
  x: number;
  y: number;
}

export interface ExploreCallbacks {
  onTalk(dialogueId: string): void;
  onTrigger(event: string): void;
}

/**
 * Режим исследования: отряд цепочкой ходит по деревне, NPC с маркерами,
 * триггеры зон (дверь часовни). Без ОД и тумана — мирная сцена.
 */
export class ExploreScene {
  grid: Grid;
  mapView = new MapView();
  unitLayer = new THREE.Group();
  leader: UnitView | null = null;
  followers: UnitView[] = [];
  npcs: { view: UnitView; spawn: NpcSpawn; marker: THREE.Sprite }[] = [];
  busy = false;
  private disposed = false;
  private raycaster = new THREE.Raycaster();
  private floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  /** недавние клетки лидера — по ним идут спутники */
  private trail: Vec2[] = [];

  constructor(
    private iso: IsoScene,
    public mapId: string,
    private squad: UnitState[],
    private npcSpawns: NpcSpawn[],
    private cb: ExploreCallbacks,
  ) {
    this.grid = new Grid(mapDef(mapId));
  }

  async init(): Promise<void> {
    const def = mapDef(this.mapId);
    await this.mapView.build(this.iso, this.grid, def);
    this.iso.scene.add(this.unitLayer);
    const spawns = this.grid.playerSpawns();
    const jobs: Promise<void>[] = [];
    this.squad.forEach((u, i) => {
      u.pos = { ...spawns[i % spawns.length] };
      const v = new UnitView(u);
      this.unitLayer.add(v.root);
      jobs.push(v.load().then(() => v.setCell(u.pos.x, u.pos.y)));
      if (i === 0) this.leader = v;
      else this.followers.push(v);
    });
    for (const ns of this.npcSpawns) {
      const tpl = NPCS[ns.defId];
      const u = makeUnit(tpl, ns.defId);
      u.pos = { x: ns.x, y: ns.y };
      const v = new UnitView(u);
      this.unitLayer.add(v.root);
      jobs.push(v.load().then(() => v.setCell(ns.x, ns.y)));
      const marker = this.makeMarker();
      v.root.add(marker);
      this.npcs.push({ view: v, spawn: ns, marker });
    }
    await Promise.all(jobs);
    this.trail = [{ ...this.squad[0].pos }];
    const l = this.squad[0].pos;
    this.iso.jumpToCell(l.x, l.y);
  }

  private makeMarker(): THREE.Sprite {
    const s = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: makeGlowTexture(),
        color: 0xd8b86a,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    s.scale.setScalar(0.8);
    s.position.y = 3.1;
    return s;
  }

  dispose(): void {
    this.disposed = true;
    this.iso.scene.remove(this.mapView.group, this.unitLayer);
  }

  pickCell(ev: PointerEvent | MouseEvent): Vec2 | null {
    const ndc = new THREE.Vector2(
      (ev.clientX / window.innerWidth) * 2 - 1,
      -(ev.clientY / window.innerHeight) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.iso.camera);
    const pt = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.floorPlane, pt)) return null;
    const x = Math.round(pt.x / CELL);
    const y = Math.round(pt.z / CELL);
    if (!this.grid.inBounds(x, y)) return null;
    return { x, y };
  }

  async onClick(ev: PointerEvent): Promise<void> {
    if (this.busy || !this.leader) return;
    const cell = this.pickCell(ev);
    if (!cell) return;
    const leaderU = this.squad[0];

    // клик по NPC → подойти и заговорить
    const npc = this.npcs.find(
      (n) => Math.abs(n.spawn.x - cell.x) <= 1 && Math.abs(n.spawn.y - cell.y) <= 1,
    );
    if (npc) {
      const d = Math.abs(leaderU.pos.x - npc.spawn.x) + Math.abs(leaderU.pos.y - npc.spawn.y);
      if (d > 1) {
        await this.walkLeaderTo({ x: npc.spawn.x, y: npc.spawn.y }, true);
      }
      const d2 = Math.abs(leaderU.pos.x - npc.spawn.x) + Math.abs(leaderU.pos.y - npc.spawn.y);
      if (d2 <= 2 && !this.disposed) {
        npc.view.faceTowards(leaderU.pos.x, leaderU.pos.y);
        this.cb.onTalk(npc.spawn.dialogue);
      }
      return;
    }

    // дверь часовни — триггер по клику
    const trig = this.triggerAt(cell);
    if (trig) {
      const dist = () => Math.abs(leaderU.pos.x - cell.x) + Math.abs(leaderU.pos.y - cell.y);
      if (dist() > 1) await this.walkLeaderTo(cell, true);
      if (!this.disposed && dist() <= 1) this.cb.onTrigger(trig);
      return;
    }

    await this.walkLeaderTo(cell, false);
    // триггер по входу в зону
    const t2 = this.triggerNear(leaderU.pos);
    if (t2 && !this.disposed) this.cb.onTrigger(t2);
  }

  private triggerAt(cell: Vec2): string | null {
    for (const tr of mapDef(this.mapId).triggers ?? []) {
      if (cell.x >= tr.x && cell.x < tr.x + tr.w && cell.y >= tr.y && cell.y < tr.y + tr.h)
        return tr.event;
    }
    // клик прямо по двери часовни
    if (this.grid.kindAt(cell.x, cell.y) === 'door') return 'chapel';
    return null;
  }

  private triggerNear(pos: Vec2): string | null {
    return this.triggerAt(pos);
  }

  private async walkLeaderTo(goal: Vec2, adjacent: boolean): Promise<void> {
    if (!this.leader) return;
    const leaderU = this.squad[0];
    const occupied = new Set<string>();
    for (const n of this.npcs) occupied.add(n.spawn.x + ',' + n.spawn.y);
    const path = findPath(this.grid, leaderU.pos, goal, occupied, adjacent);
    if (!path || !path.length) return;
    this.busy = true;
    // спутники идут следом по «хвосту» лидера
    const full = [...this.trail.slice(-1), ...path];
    leaderU.pos = { ...path[path.length - 1] };
    const walks: Promise<void>[] = [this.leader.walkPath(path, 6)];
    this.followers.forEach((f, i) => {
      const lag = i + 1;
      const fPath = full.slice(0, Math.max(0, full.length - lag));
      const trimmed = fPath.slice(-path.length);
      if (trimmed.length) {
        const u = this.squad[i + 1];
        u.pos = { ...trimmed[trimmed.length - 1] };
        walks.push(f.walkPath(trimmed, 6));
      }
    });
    this.trail = full.slice(-8);
    this.iso.lookAtCell(leaderU.pos.x, leaderU.pos.y);
    await Promise.all(walks);
    this.busy = false;
  }

  private wallFader: WallFader | null = null;

  update(dt: number, time: number): void {
    this.leader?.update(dt);
    for (const f of this.followers) f.update(dt);
    for (const n of this.npcs) {
      n.view.update(dt);
      n.marker.position.y = 3.1 + Math.sin(time * 2.2) * 0.12;
    }
    this.mapView.update(time);
    if (!this.wallFader) this.wallFader = new WallFader(this.mapView);
    const targets = [];
    if (this.leader) targets.push(this.leader.root.position);
    this.wallFader.update(this.iso.camera, targets);
  }
}
