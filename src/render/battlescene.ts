import * as THREE from 'three';
import { EnemyAI } from '../game/ai';
import { Battle } from '../game/combat';
import { mapDef } from '../data/maps';
import { itemDef } from '../data/items';
import type { BattleEvent, UnitState, Vec2, WeaponDef } from '../game/types';
import { v2key } from '../game/types';
import { pathTo } from '../game/pathfind';
import { weaponOf } from '../game/unit';
import { audio } from '../audio/synth';
import { FogOfWar } from './fogofwar';
import { Fx } from './fx';
import { MapView } from './mapview';
import { TacticalOverlay } from './overlay';
import { CELL, cellToWorld, type IsoScene } from './scene';
import { UnitView } from './unitview';
import { WallFader } from './wallfade';

export interface BattleCallbacks {
  onHudRefresh(): void;
  onBattleEnd(result: 'victory' | 'defeat'): void;
  onMessage(key: string): void;
  /** обновить карточку врага под курсором (null — спрятать) */
  onEnemyHover(unit: UnitState | null): void;
  /** обыск: клик по соседнему сундуку или телу */
  onLoot?(at: Vec2, body: UnitState | null): void;
}

type TargetMode = { kind: 'none' } | { kind: 'aoe'; range: number } | { kind: 'heal'; slot: number };

/**
 * Боевая сцена: владеет движком боя, видами юнитов, разметкой, туманом
 * и проигрыванием очереди событий. Ввод заблокирован, пока анимируются события.
 */
export class BattleScene {
  battle: Battle;
  ai = new EnemyAI();
  mapView = new MapView();
  overlay = new TacticalOverlay();
  fog: FogOfWar;
  fx: Fx;
  views = new Map<string, UnitView>();
  unitLayer = new THREE.Group();

  busy = false;
  attackMode: 'light' | 'heavy' = 'light';
  targetMode: TargetMode = { kind: 'none' };
  private hoverCell: Vec2 | null = null;
  private raycaster = new THREE.Raycaster();
  private floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private disposed = false;

  constructor(
    private iso: IsoScene,
    battle: Battle,
    private labelLayer: HTMLDivElement,
    private cb: BattleCallbacks,
  ) {
    this.battle = battle;
    this.fog = new FogOfWar(battle.grid.w, battle.grid.h);
    this.fx = new Fx(iso, labelLayer);
  }

  async init(): Promise<void> {
    const def = mapDef(this.battle.state.mapId);
    await this.mapView.build(this.iso, this.battle.grid, def);
    this.iso.scene.add(this.unitLayer, this.overlay.group, this.fog.plane);
    await Promise.all(
      this.battle.state.units.map(async (u) => {
        const v = new UnitView(u);
        this.views.set(u.id, v);
        this.unitLayer.add(v.root);
        await v.load();
        v.setCell(u.pos.x, u.pos.y);
        if (u.down) v.play('downed', false, 0);
      }),
    );
    for (const key of this.battle.state.openDoors) {
      const [x, y] = key.split(',').map(Number);
      this.mapView.setDoorOpen(x, y);
    }
    this.fx.igniteCells(this.battle.state.fire.map((f) => ({ x: f.x, y: f.y })));
    const first = this.battle.state.units.find((u) => u.side === 'player' && !u.down);
    if (first) this.iso.jumpToCell(first.pos.x, first.pos.y);
    this.refreshVisibility();
    this.refreshOverlays();
  }

  dispose(): void {
    this.disposed = true;
    this.iso.scene.remove(this.mapView.group, this.unitLayer, this.overlay.group, this.fog.plane);
    this.fx.clearAllFires();
    this.labelLayer.innerHTML = '';
  }

  get activeUnit(): UnitState | null {
    return this.battle.activeUnit();
  }

  get isPlayerTurn(): boolean {
    return !this.busy && this.activeUnit?.side === 'player' && !this.battle.state.result;
  }

  // ---------- Видимость ----------

  refreshVisibility(): void {
    const vis = this.battle.teamVisible('player');
    this.fog.update(vis);
    for (const u of this.battle.state.units) {
      const v = this.views.get(u.id);
      if (!v) continue;
      if (u.side === 'enemy') {
        v.root.visible = vis.has(v2key(u.pos));
      }
    }
  }

  // ---------- Разметка ----------

  refreshOverlays(): void {
    this.overlay.clearAll();
    const u = this.activeUnit;
    for (const [id, v] of this.views) v.setSelected(id === u?.id && u.side === 'player');
    if (!this.isPlayerTurn || !u) return;
    const reach = this.battle.reachableFor(u);
    const w = weaponOf(u);
    const atkCost = w.apLight;
    const canAttackAfter = new Set<string>();
    const cells: Vec2[] = [];
    for (const [key, entry] of reach) {
      const [x, y] = key.split(',').map(Number);
      cells.push({ x, y });
      if (u.ap - entry.cost >= atkCost) canAttackAfter.add(key);
    }
    this.overlay.showReachable(cells, canAttackAfter);
    this.overlay.showCoverMarks(this.battle.grid, u.pos);
    this.cb.onHudRefresh();
  }

  // ---------- Ввод ----------

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
    if (!this.battle.grid.inBounds(x, y)) return null;
    return { x, y };
  }

  onPointerMove(ev: PointerEvent): void {
    if (!this.isPlayerTurn) {
      this.overlay.setHover(null);
      this.cb.onEnemyHover(null);
      return;
    }
    const cell = this.pickCell(ev);
    this.hoverCell = cell;
    const u = this.activeUnit!;
    this.overlay.clearPath();
    this.overlay.showAoe(null);
    this.cb.onEnemyHover(null);
    if (!cell) {
      this.overlay.setHover(null);
      return;
    }
    const vis = this.battle.teamVisible('player');
    const enemy = this.battle.unitAt(cell);
    const isVisEnemy = enemy && enemy.side === 'enemy' && vis.has(v2key(cell));

    if (this.targetMode.kind === 'aoe') {
      this.overlay.showAoe(cell);
      this.overlay.setHover(cell, true);
      return;
    }
    if (this.targetMode.kind === 'heal') {
      this.overlay.setHover(cell, false);
      return;
    }
    if (isVisEnemy) {
      this.overlay.setHover(cell, true);
      this.cb.onEnemyHover(enemy);
      return;
    }
    this.overlay.setHover(cell, false);
    // превью пути
    const reach = this.battle.reachableFor(u);
    const path = pathTo(reach, cell);
    if (path) this.overlay.showPath(path);
  }

  async onClick(ev: PointerEvent): Promise<void> {
    if (!this.isPlayerTurn) return;
    const cell = this.pickCell(ev);
    if (!cell) return;
    const u = this.activeUnit!;
    const vis = this.battle.teamVisible('player');

    if (this.targetMode.kind === 'aoe') {
      this.targetMode = { kind: 'none' };
      this.overlay.showAoe(null);
      await this.doAction({ type: 'attackArea', at: cell });
      return;
    }
    if (this.targetMode.kind === 'heal') {
      const slot = this.targetMode.slot;
      this.targetMode = { kind: 'none' };
      const ally = this.battle.unitAt(cell);
      if (ally && ally.side === 'player') {
        await this.doAction({ type: 'useQuick', slot, target: ally.id });
      }
      return;
    }

    const enemy = this.battle.unitAt(cell);
    if (enemy && enemy.side === 'enemy' && vis.has(v2key(cell))) {
      const w = weaponOf(u);
      if (w.aoe) {
        await this.doAction({ type: 'attackArea', at: cell });
        return;
      }
      const err = this.battle.canAttack(u, enemy, this.attackMode);
      if (err) {
        this.cb.onMessage(err);
        audio.uiDeny();
        return;
      }
      await this.doAction({ type: 'attack', target: enemy.id, mode: this.attackMode });
      return;
    }
    // дверь
    if (this.battle.grid.kindAt(cell.x, cell.y) === 'door' && !this.battle.grid.isDoorOpen(cell.x, cell.y)) {
      await this.doAction({ type: 'openDoor', at: cell });
      return;
    }
    // обыск: сундук или тело вплотную
    const adj = Math.abs(cell.x - u.pos.x) + Math.abs(cell.y - u.pos.y) <= 1;
    if (adj && this.cb.onLoot) {
      const isChest = this.battle.grid.charAt(cell.x, cell.y) === 'C';
      const body = this.battle.bodyAt(cell);
      if (isChest || (body && body.side === 'enemy' && !body.looted)) {
        this.cb.onLoot(cell, body ?? null);
        return;
      }
    }
    // движение
    const reach = this.battle.reachableFor(u);
    if (reach.has(v2key(cell))) {
      await this.doAction({ type: 'move', to: cell });
    }
  }

  onRightClick(): void {
    this.targetMode = { kind: 'none' };
    this.overlay.showAoe(null);
    this.cb.onHudRefresh();
  }

  /** Tab: перебор видимых целей */
  private tabIdx = 0;
  cycleTarget(): void {
    if (!this.isPlayerTurn) return;
    const vis = this.battle.teamVisible('player');
    const enemies = this.battle.state.units.filter(
      (e) => e.side === 'enemy' && !e.down && vis.has(v2key(e.pos)),
    );
    if (!enemies.length) return;
    this.tabIdx = (this.tabIdx + 1) % enemies.length;
    const t = enemies[this.tabIdx];
    this.iso.lookAtCell(t.pos.x, t.pos.y);
    this.cb.onEnemyHover(t);
  }

  // ---------- Действия и проигрывание событий ----------

  async doAction(action: Parameters<Battle['perform']>[0]): Promise<void> {
    if (this.busy) return;
    const events = this.battle.perform(action);
    await this.playEvents(events);
    this.afterEvents();
  }

  async endTurnAction(): Promise<void> {
    if (this.busy || !this.isPlayerTurn) return;
    const events = this.battle.perform({ type: 'pass' });
    await this.playEvents(events);
    this.afterEvents();
  }

  private afterEvents(): void {
    if (this.disposed) return;
    this.refreshVisibility();
    this.refreshOverlays();
    if (this.battle.state.result) {
      this.cb.onBattleEnd(this.battle.state.result);
      return;
    }
    void this.maybeRunAI();
  }

  /** ходы ИИ — пока не дойдёт до игрока */
  async maybeRunAI(): Promise<void> {
    while (!this.disposed && !this.battle.state.result) {
      const u = this.battle.activeUnit();
      if (!u || u.side !== 'enemy') break;
      this.busy = true;
      this.cb.onHudRefresh();
      await sleep(250);
      const events = this.ai.takeTurn(this.battle, u);
      await this.playEvents(events);
      this.refreshVisibility();
    }
    this.busy = false;
    if (this.disposed) return;
    this.refreshVisibility();
    this.refreshOverlays();
    if (this.battle.state.result) this.cb.onBattleEnd(this.battle.state.result);
  }

  async playEvents(events: BattleEvent[]): Promise<void> {
    this.busy = true;
    this.overlay.clearAll();
    this.cb.onEnemyHover(null);
    for (const e of events) {
      if (this.disposed) return;
      await this.playEvent(e);
    }
    this.busy = false;
  }

  private worldOf(id: string): THREE.Vector3 {
    return this.views.get(id)?.root.position.clone() ?? new THREE.Vector3();
  }

  private async playEvent(e: BattleEvent): Promise<void> {
    const vis = () => this.battle.teamVisible('player');
    switch (e.type) {
      case 'move': {
        const v = this.views.get(e.unit)!;
        const visible = v.unit.side === 'player' || e.path.some((p) => vis().has(v2key(p)));
        if (v.unit.side === 'enemy') {
          // враг может выйти из тумана по пути
          if (!visible) {
            v.setCell(e.path[e.path.length - 1].x, e.path[e.path.length - 1].y);
            return;
          }
          v.root.visible = true;
        }
        if (v.unit.side === 'enemy') this.iso.lookAtCell(e.path[0].x, e.path[0].y);
        await v.walkPath(e.path, v.unit.side === 'enemy' ? 6.5 : 5.5);
        this.refreshVisibility();
        break;
      }
      case 'attack': {
        const a = this.views.get(e.unit)!;
        const t = this.views.get(e.target)!;
        a.faceTowards(t.unit.pos.x, t.unit.pos.y);
        t.faceTowards(a.unit.pos.x, a.unit.pos.y);
        const w = itemDef(e.weapon) as WeaponDef;
        if (a.unit.side === 'enemy' && a.root.visible)
          this.iso.lookAtCell(a.unit.pos.x, a.unit.pos.y);
        if (w.wclass === 'ranged') {
          const anim = a.play('shoot');
          await sleep(350);
          audio.shoot();
          await this.fx.projectile(
            a.root.position.clone().add(new THREE.Vector3(0, 1.5, 0)),
            t.root.position.clone().add(new THREE.Vector3(0, 1.3, 0)),
            'bolt',
          );
          void anim;
        } else if (w.wclass === 'thrown') {
          const anim = a.play('throw');
          await sleep(300);
          audio.swing();
          await this.fx.projectile(
            a.root.position.clone().add(new THREE.Vector3(0, 1.5, 0)),
            t.root.position.clone().add(new THREE.Vector3(0, 1.3, 0)),
            'knife',
          );
          void anim;
        } else {
          const heavy = e.mode === 'heavy';
          const anim = a.play(
            w.twoHanded ? (heavy ? 'melee2hHeavy' : 'melee2h') : heavy ? 'melee1hHeavy' : 'melee1h',
          );
          await sleep(380);
          audio.swing();
          void anim;
        }
        if (e.hit) {
          audio.hit(e.crit);
          await this.fx.hitFlash(t.root.position);
          this.fx.floatText(
            t.root.position,
            (e.crit ? 'КРИТ ' : '') + '−' + e.dmg,
            e.crit ? 'crit' : 'dmg',
          );
          if (e.killed || e.downed) {
            await t.play(e.downed ? 'downed' : 'death');
            audio.death();
          } else {
            void t.play('hit').then(() => {
              if (!t.unit.down) t.play('idle', true);
            });
          }
        } else {
          audio.miss();
          this.fx.floatText(t.root.position, 'мимо', 'miss');
        }
        await sleep(200);
        break;
      }
      case 'throw': {
        const a = this.views.get(e.unit)!;
        a.faceTowards(e.at.x, e.at.y);
        const anim = a.play('throw');
        await sleep(350);
        void anim;
        const to = cellToWorld(e.at.x, e.at.y);
        to.y = 0.3;
        await this.fx.lob(a.root.position.clone().add(new THREE.Vector3(0, 1.6, 0)), to);
        audio.explosion();
        await this.fx.explosion(e.at);
        break;
      }
      case 'aoeFire':
        this.fx.igniteCells(e.cells);
        await sleep(150);
        break;
      case 'fireOut':
        this.fx.extinguish(e.cells);
        break;
      case 'damage': {
        const v = this.views.get(e.unit)!;
        this.fx.floatText(v.root.position, '−' + e.amount, e.source === 'fire' ? 'fire' : 'dmg');
        if (e.killed || e.downed) {
          await v.play(e.downed ? 'downed' : 'death');
          audio.death();
        }
        await sleep(120);
        break;
      }
      case 'heal': {
        const v = this.views.get(e.unit)!;
        this.fx.floatText(v.root.position, '+' + e.amount, 'heal');
        audio.heal();
        await sleep(150);
        break;
      }
      case 'status': {
        const v = this.views.get(e.unit)!;
        if (e.on) {
          this.fx.floatText(v.root.position, statusLabel(e.status), 'status');
          await sleep(120);
        }
        break;
      }
      case 'useItem': {
        const v = this.views.get(e.unit)!;
        await v.play('useItem');
        v.play('idle', true);
        break;
      }
      case 'reload': {
        const v = this.views.get(e.unit)!;
        audio.reload();
        await v.play('reload');
        v.play('idle', true);
        break;
      }
      case 'door': {
        this.mapView.setDoorOpen(e.at.x, e.at.y);
        this.battle.grid.setDoorsOpen(this.battle.state.openDoors);
        audio.door();
        this.refreshVisibility();
        await sleep(150);
        break;
      }
      case 'swap': {
        const v = this.views.get(e.unit)!;
        await v.equipWeapon(e.weapon);
        await sleep(120);
        break;
      }
      case 'turnStart': {
        const u = this.battle.unit(e.unit);
        if (u.side === 'player') {
          this.iso.lookAtCell(u.pos.x, u.pos.y);
          audio.turn();
        }
        this.cb.onHudRefresh();
        await sleep(100);
        break;
      }
      case 'panic': {
        const v = this.views.get(e.unit)!;
        if (v.root.visible) {
          this.fx.floatText(v.root.position, 'паника!', 'status');
          await sleep(250);
        }
        break;
      }
      case 'secondWind': {
        const v = this.views.get(e.unit)!;
        this.fx.floatText(v.root.position, '+ОД', 'heal');
        await sleep(150);
        break;
      }
      case 'pass':
      case 'face':
      case 'transfer':
      case 'xp':
        break;
      case 'battleEnd':
        await sleep(600);
        break;
    }
  }

  // ---------- Кадр ----------

  update(dt: number, time: number): void {
    for (const v of this.views.values()) v.update(dt);
    this.mapView.update(time);
    this.fx.update(time);
    this.updateWallFade();
  }

  private wallFader: WallFader | null = null;

  /** стены, заслоняющие бойцов, становятся полупрозрачными */
  private updateWallFade(): void {
    if (!this.wallFader) this.wallFader = new WallFader(this.mapView);
    const targets: THREE.Vector3[] = [];
    for (const u of this.battle.state.units) {
      if (u.side !== 'player' || u.down) continue;
      const v = this.views.get(u.id);
      if (v) targets.push(v.root.position);
    }
    this.wallFader.update(this.iso.camera, targets);
  }
}

function statusLabel(s: string): string {
  if (s === 'bleed') return 'кровотечение';
  if (s === 'burn') return 'горит';
  if (s === 'stun') return 'оглушён';
  return s;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
