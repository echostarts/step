import { Rng } from '../core/rng';
import { itemDef } from '../data/items';
import { mapDef } from '../data/maps';
import { Grid, neighbors4 } from './grid';
import { hasLos, visibleFrom, SIGHT_RADIUS } from './los';
import { pathTo, reachable, type ReachEntry } from './pathfind';
import type {
  AttackMode,
  BattleAction,
  BattleEvent,
  BattleState,
  ConsumableDef,
  HitPreview,
  StatusKind,
  UnitState,
  Vec2,
  WeaponDef,
} from './types';
import { dist, v2eq, v2key } from './types';
import {
  armorValue,
  critChance,
  dodgeOf,
  effStat,
  hasPerk,
  hasStatus,
  maxAp,
  weaponOf,
} from './unit';

export const AP_COSTS = {
  useItem: 4,
  useItemApothecary: 2,
  openDoor: 1,
  transfer: 2,
  swap: 1,
  passBankMax: 2,
};

const BLEED_DMG = 2;
const BURN_DMG = 3;

/**
 * Движок боя. Полностью детерминирован (Rng сериализуется в state),
 * не знает о рендере: на каждое действие возвращает список событий,
 * которые слой отображения проигрывает очередью.
 */
export class Battle {
  state: BattleState;
  grid: Grid;
  private rng: Rng;
  /** перки, сработавшие «раз за бой» */
  private battleFlags = new Set<string>();

  constructor(state: BattleState, battleFlags?: string[]) {
    this.state = state;
    this.grid = new Grid(mapDef(state.mapId));
    this.grid.setDoorsOpen(state.openDoors);
    this.rng = new Rng(state.rngState);
    if (battleFlags) this.battleFlags = new Set(battleFlags);
  }

  serializeFlags(): string[] {
    return [...this.battleFlags];
  }

  private syncRng(): void {
    this.state.rngState = this.rng.state;
  }

  static create(mapId: string, units: UnitState[], seed: number): Battle {
    const state: BattleState = {
      mapId,
      rngState: seed >>> 0,
      units,
      order: [],
      turnIdx: -1,
      round: 0,
      fire: [],
      openDoors: [],
      result: null,
      xpAwarded: 0,
      leaderDead: false,
    };
    const battle = new Battle(state);
    battle.computeOrder();
    return battle;
  }

  /** инициатива: Ловкость по убыванию; при равенстве игроки раньше */
  computeOrder(): void {
    const alive = this.state.units.filter((u) => !u.down);
    alive.sort((a, b) => {
      const d = effStat(b, 'dex') - effStat(a, 'dex');
      if (d !== 0) return d;
      if (a.side !== b.side) return a.side === 'player' ? -1 : 1;
      return a.id < b.id ? -1 : 1;
    });
    this.state.order = alive.map((u) => u.id);
  }

  unit(id: string): UnitState {
    const u = this.state.units.find((x) => x.id === id);
    if (!u) throw new Error('no unit ' + id);
    return u;
  }

  activeUnit(): UnitState | null {
    if (this.state.turnIdx < 0 || this.state.result) return null;
    const id = this.state.order[this.state.turnIdx];
    return id ? this.unit(id) : null;
  }

  unitAt(p: Vec2): UnitState | undefined {
    return this.state.units.find((u) => !u.down && v2eq(u.pos, p));
  }

  bodyAt(p: Vec2): UnitState | undefined {
    return this.state.units.find((u) => u.down && v2eq(u.pos, p));
  }

  occupied(excludeId?: string): Set<string> {
    const s = new Set<string>();
    for (const u of this.state.units) if (!u.down && u.id !== excludeId) s.add(v2key(u.pos));
    return s;
  }

  /** видимость отряда (туман войны) */
  teamVisible(side: 'player' | 'enemy'): Set<string> {
    const out = new Set<string>();
    for (const u of this.state.units) {
      if (u.side !== side || u.down) continue;
      for (const k of visibleFrom(this.grid, u.pos)) out.add(k);
    }
    return out;
  }

  reachableFor(u: UnitState): Map<string, ReachEntry> {
    return reachable(this.grid, u.pos, u.ap, this.occupied(u.id));
  }

  // ---------- Укрытия ----------

  /**
   * Укрытие цели от атакующего: смотрим стороны клетки цели; укрытие
   * действует, если стоит «между» (направление на атакующего пересекает
   * эту сторону). Вплотную укрытие не работает. Фланг = укрытия есть,
   * но ни одно не направлено на атакующего.
   */
  coverAgainst(attackerPos: Vec2, target: UnitState): { cover: 'none' | 'half' | 'full'; flanked: boolean } {
    let best: 'none' | 'half' | 'full' = 'none';
    let hasAnyCover = false;
    const adjacent = dist(attackerPos, target.pos) < 1.5;
    if (!adjacent) {
      const ax = attackerPos.x - target.pos.x;
      const ay = attackerPos.y - target.pos.y;
      const alen = Math.hypot(ax, ay) || 1;
      for (const n of neighbors4(target.pos)) {
        const cv = this.grid.coverValue(n.x, n.y);
        if (cv === 'none') continue;
        hasAnyCover = true;
        const dx = n.x - target.pos.x;
        const dy = n.y - target.pos.y;
        const dot = (dx * ax + dy * ay) / alen;
        if (dot > 0.35) {
          if (cv === 'full' || best === 'full') best = 'full';
          else best = 'half';
        }
      }
    }
    let flanked = hasAnyCover && best === 'none';
    // Стена щитов: вплотную к союзнику с перком — оба в полуукрытии отовсюду
    if (best === 'none' && this.shieldWallActive(target)) {
      best = 'half';
      flanked = false;
    }
    return { cover: best, flanked };
  }

  private shieldWallActive(u: UnitState): boolean {
    for (const n of neighbors4(u.pos)) {
      const ally = this.unitAt(n);
      if (ally && ally.side === u.side && (hasPerk(ally, 'shield_wall') || hasPerk(u, 'shield_wall')))
        return true;
    }
    return false;
  }

  // ---------- Шанс попадания ----------

  hitPreview(attacker: UnitState, target: UnitState, mode: AttackMode): HitPreview {
    const w = weaponOf(attacker);
    const parts: { key: string; val: number }[] = [];
    const d = dist(attacker.pos, target.pos);
    const losOk = hasLos(this.grid, attacker.pos, target.pos);
    const ranged = w.wclass !== 'melee';

    let acc = w.baseAcc;
    parts.push({ key: 'acc.base', val: w.baseAcc });

    const statMod = (effStat(attacker, 'dex') - 5) * (ranged ? 3 : 2);
    if (statMod !== 0) parts.push({ key: 'acc.stat', val: statMod });
    acc += statMod;

    const dodge = dodgeOf(target);
    if (dodge !== 0) parts.push({ key: 'acc.dodge', val: -dodge });
    acc -= dodge;

    if (ranged && w.optimal && d > w.optimal) {
      const pen = Math.round((d - w.optimal) * 4);
      parts.push({ key: 'acc.dist', val: -pen });
      acc -= pen;
    }

    const { cover, flanked } = this.coverAgainst(attacker.pos, target);
    if (cover === 'half') {
      parts.push({ key: 'acc.cover', val: -20 });
      acc -= 20;
    } else if (cover === 'full') {
      parts.push({ key: 'acc.cover', val: -40 });
      acc -= 40;
    } else if (flanked) {
      parts.push({ key: 'acc.flank', val: 0 });
    }

    if (hasStatus(target, 'stun')) {
      parts.push({ key: 'acc.stunned', val: 25 });
      acc += 25;
    }
    if (hasStatus(attacker, 'burn')) {
      parts.push({ key: 'acc.burning', val: -10 });
      acc -= 10;
    }
    if (mode === 'heavy') {
      parts.push({ key: 'acc.heavy', val: -10 });
      acc -= 10;
    }

    acc = Math.max(5, Math.min(95, Math.round(acc)));

    // Хладнокровие: первая атака в бою по неповреждённому врагу бьёт всегда
    if (
      hasPerk(attacker, 'cold_blood') &&
      target.hp === target.maxHp &&
      !this.battleFlags.has('cold_blood_' + attacker.id)
    ) {
      acc = 100;
    }

    const statDmg = Math.max(0, effStat(attacker, w.dmgStat) - 5);
    const mult = (mode === 'heavy' ? 1.5 : 1) * (attacker.marks.includes(target.id) ? 1.25 : 1);
    const armor = armorValue(target);
    const dmgMin = Math.max(1, Math.round((w.dmg.n + w.dmg.plus + statDmg) * mult) - armor);
    const dmgMax = Math.max(1, Math.round((w.dmg.n * w.dmg.d + w.dmg.plus + statDmg) * mult) - armor);

    return {
      chance: acc,
      critChance: Math.max(0, critChance(attacker)),
      dmgMin,
      dmgMax,
      parts,
      blocked: !losOk,
      flanked,
      cover,
    };
  }

  /** проверка возможности атаки; null = можно, иначе ключ ошибки */
  canAttack(u: UnitState, target: UnitState, mode: AttackMode): string | null {
    const w = weaponOf(u);
    const cost = mode === 'heavy' ? w.apHeavy : w.apLight;
    if (cost === undefined) return 'hud.noAp';
    if (u.ap < cost) return 'hud.noAp';
    const d = dist(u.pos, target.pos);
    if (d > w.range + 0.45) return 'hud.outOfRange';
    if (!hasLos(this.grid, u.pos, target.pos)) return 'hud.noLos';
    if (w.clip && u.loaded <= 0) return 'hud.needReload';
    if (w.wclass === 'thrown' && !w.clip && w.ammoId && this.countAmmo(u, w.ammoId) <= 0)
      return 'hud.noAmmo';
    return null;
  }

  countAmmo(u: UnitState, ammoId: string): number {
    let n = 0;
    for (const s of u.quick) if (s && s.id === ammoId) n += s.count;
    return n;
  }

  private spendAmmo(u: UnitState, ammoId: string, n = 1): boolean {
    for (const s of u.quick) {
      if (s && s.id === ammoId && s.count >= n) {
        s.count -= n;
        if (s.count <= 0) {
          const i = u.quick.indexOf(s);
          u.quick[i] = null;
        }
        return true;
      }
    }
    return false;
  }

  // ---------- Действия ----------

  perform(action: BattleAction): BattleEvent[] {
    const u = this.activeUnit();
    if (!u || this.state.result) return [];
    const ev: BattleEvent[] = [];
    switch (action.type) {
      case 'move':
        this.doMove(u, action.to, ev);
        break;
      case 'attack':
        this.doAttack(u, this.unit(action.target), action.mode, ev);
        break;
      case 'attackArea':
        this.doAttackArea(u, action.at, ev);
        break;
      case 'reload':
        this.doReload(u, ev);
        break;
      case 'useQuick':
        this.doUseQuick(u, action.slot, action.target, action.at, ev);
        break;
      case 'openDoor':
        this.doOpenDoor(u, action.at, ev);
        break;
      case 'swapWeapon':
        this.doSwap(u, ev);
        break;
      case 'transfer':
        this.doTransfer(u, action.to, action.item, ev);
        break;
      case 'surge':
        this.doSurge(u, ev);
        break;
      case 'pass':
        this.doPass(u, ev);
        break;
    }
    this.syncRng();
    this.checkEnd(ev);
    return ev;
  }

  private doMove(u: UnitState, to: Vec2, ev: BattleEvent[]): void {
    const reach = this.reachableFor(u);
    const path = pathTo(reach, to);
    if (!path || path.length === 0) return;
    const cost = reach.get(v2key(to))!.cost;
    u.ap -= cost;
    u.pos = { ...to };
    ev.push({ type: 'move', unit: u.id, path });
    // огонь под ногами по пути
    for (const c of path) {
      if (this.fireAt(c)) {
        this.addStatus(u, 'burn', 2, ev);
        break;
      }
    }
    // Ответный удар: враг закончил движение вплотную к носителю перка
    if (u.side === 'enemy') {
      for (const n of neighbors4(u.pos)) {
        const holder = this.unitAt(n);
        if (
          holder &&
          holder.side === 'player' &&
          hasPerk(holder, 'riposte') &&
          !this.battleFlags.has('riposte_r' + this.state.round + '_' + holder.id) &&
          weaponOf(holder).wclass === 'melee'
        ) {
          this.battleFlags.add('riposte_r' + this.state.round + '_' + holder.id);
          this.resolveAttack(holder, u, 'light', ev, { free: true });
          break;
        }
      }
    }
  }

  private doAttack(u: UnitState, target: UnitState, mode: AttackMode, ev: BattleEvent[]): void {
    if (this.canAttack(u, target, mode)) return;
    const w = weaponOf(u);
    const cost = mode === 'heavy' ? w.apHeavy! : w.apLight;
    u.ap -= cost;
    if (w.clip) u.loaded--;
    if (w.wclass === 'thrown' && w.ammoId && !w.aoe) this.spendAmmo(u, w.ammoId);
    this.resolveAttack(u, target, mode, ev);
  }

  private resolveAttack(
    attacker: UnitState,
    target: UnitState,
    mode: AttackMode,
    ev: BattleEvent[],
    opts: { free?: boolean } = {},
  ): void {
    const w = weaponOf(attacker);
    const pre = this.hitPreview(attacker, target, mode);
    if (hasPerk(attacker, 'cold_blood')) this.battleFlags.add('cold_blood_' + attacker.id);
    const hit = this.rng.chance(pre.chance);
    let crit = false;
    let dmg = 0;
    let killed = false;
    let downed = false;
    if (hit) {
      crit = this.rng.chance(pre.critChance);
      let roll = this.rng.dice(w.dmg.n, w.dmg.d, w.dmg.plus) + Math.max(0, effStat(attacker, w.dmgStat) - 5);
      if (mode === 'heavy') roll = Math.round(roll * 1.5);
      if (crit) roll *= 2;
      if (attacker.marks.includes(target.id)) roll = Math.round(roll * 1.25);
      dmg = Math.max(1, roll - armorValue(target));
      const res = this.applyDamage(target, dmg, attacker, ev);
      killed = res.killed;
      downed = res.downed;
      // крит ближнего боя и «Зазубренный край» — кровотечение
      if (
        w.wclass === 'melee' &&
        (crit || (mode === 'heavy' && hasPerk(attacker, 'jagged_edge'))) &&
        !target.down
      )
        this.addStatus(target, 'bleed', 2, ev);
      // Терновый обет
      if (
        w.wclass === 'melee' &&
        target.amuletId === 'amulet_thorns' &&
        !target.down &&
        dist(attacker.pos, target.pos) < 1.5
      ) {
        this.applyDamage(attacker, 2, target, ev, 'thorns');
      }
      // Кураж: крит возвращает 2 ОД (раз в ход)
      if (crit && hasPerk(attacker, 'swagger') && !this.battleFlags.has('swagger_t_' + attacker.id)) {
        this.battleFlags.add('swagger_t_' + attacker.id);
        attacker.ap += 2;
      }
      // Мародёр: добивание в ближнем — +3 ОД (раз в ход)
      if (killed && w.wclass === 'melee' && hasPerk(attacker, 'marauder') && !attacker.maraudUsed) {
        attacker.maraudUsed = true;
        attacker.ap += 3;
      }
    }
    ev.push({
      type: 'attack',
      unit: attacker.id,
      target: target.id,
      weapon: w.id,
      mode,
      hit,
      crit,
      dmg,
      killed,
      downed,
    });
    // Прострел: болт убил — летит в следующего на линии
    if (killed && w.id === 'crossbow' && hasPerk(attacker, 'pierce_shot') && !opts.free) {
      const next = this.nextOnRay(attacker.pos, target.pos, w.range);
      if (next) this.resolveAttack(attacker, next, 'light', ev, { free: true });
    }
  }

  private nextOnRay(from: Vec2, through: Vec2, maxRange: number): UnitState | null {
    const dx = through.x - from.x;
    const dy = through.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    let best: UnitState | null = null;
    let bestD = Infinity;
    for (const u of this.state.units) {
      if (u.down || u.side !== 'enemy') continue;
      if (v2eq(u.pos, through)) continue;
      const ux = u.pos.x - from.x;
      const uy = u.pos.y - from.y;
      const d = Math.hypot(ux, uy);
      if (d > maxRange || d <= len) continue;
      // близко ли к лучу
      const cross = Math.abs(dx * uy - dy * ux) / len;
      const dot = (dx * ux + dy * uy) / (len * d);
      if (cross < 0.6 && dot > 0.94 && hasLos(this.grid, from, u.pos) && d < bestD) {
        best = u;
        bestD = d;
      }
    }
    return best;
  }

  private doAttackArea(u: UnitState, at: Vec2, ev: BattleEvent[]): void {
    const w = weaponOf(u);
    if (!w.aoe || u.ap < w.apLight) return;
    if (dist(u.pos, at) > w.range + 0.45) return;
    if (!hasLos(this.grid, u.pos, at)) return;
    if (w.ammoId && !this.spendAmmo(u, w.ammoId)) return;
    u.ap -= w.apLight;
    ev.push({ type: 'throw', unit: u.id, item: w.id, at });
    this.explode(u, at, w.aoe, w.dmg, ev);
  }

  private explode(
    source: UnitState,
    at: Vec2,
    aoe: { size: number; igniteTurns: number; fireDmg: number },
    dmg: { n: number; d: number; plus: number },
    ev: BattleEvent[],
  ): void {
    const half = Math.floor(aoe.size / 2);
    const cells: Vec2[] = [];
    for (let y = at.y - half; y <= at.y + half; y++) {
      for (let x = at.x - half; x <= at.x + half; x++) {
        if (!this.grid.walkable(x, y)) continue;
        if (!hasLos(this.grid, at, { x, y })) continue;
        cells.push({ x, y });
        const exist = this.state.fire.find((f) => f.x === x && f.y === y);
        if (exist) exist.turns = Math.max(exist.turns, aoe.igniteTurns);
        else this.state.fire.push({ x, y, turns: aoe.igniteTurns });
      }
    }
    ev.push({ type: 'aoeFire', cells, turns: aoe.igniteTurns });
    const fumes = hasPerk(source, 'acrid_fumes');
    for (const c of cells) {
      const victim = this.unitAt(c);
      if (!victim) continue;
      const roll = this.rng.dice(dmg.n, dmg.d, dmg.plus) + Math.max(0, effStat(source, 'int') - 5);
      this.applyDamage(victim, Math.max(1, roll), source, ev, 'fire');
      if (!victim.down) {
        this.addStatus(victim, 'burn', 2, ev);
        if (fumes) this.addStatus(victim, 'stun', 1, ev);
      }
    }
  }

  private doReload(u: UnitState, ev: BattleEvent[]): void {
    const w = weaponOf(u);
    if (!w.clip || !w.reloadAp || u.ap < w.reloadAp) return;
    if (u.loaded >= w.clip) return;
    if (w.ammoId && !this.spendAmmo(u, w.ammoId)) return;
    u.ap -= w.reloadAp;
    u.loaded = w.clip;
    ev.push({ type: 'reload', unit: u.id });
  }

  private doUseQuick(
    u: UnitState,
    slot: number,
    targetId: string | undefined,
    at: Vec2 | undefined,
    ev: BattleEvent[],
  ): void {
    const stack = u.quick[slot];
    if (!stack) return;
    const def = itemDef(stack.id);
    if (def.kind !== 'consumable') return;
    const c = def as ConsumableDef;
    const apothecary = hasPerk(u, 'apothecary');
    const cost =
      c.use.type === 'heal' && apothecary ? AP_COSTS.useItemApothecary : AP_COSTS.useItem;
    if (u.ap < cost) return;

    if (c.use.type === 'heal') {
      let target = u;
      if (targetId && targetId !== u.id) {
        if (!apothecary) return;
        const cand = this.unit(targetId);
        if (cand.side !== u.side || dist(u.pos, cand.pos) > 1.5 || cand.down) return;
        target = cand;
      }
      u.ap -= cost;
      const amount = this.rng.dice(c.use.amount.n, c.use.amount.d, c.use.amount.plus);
      target.hp = Math.min(target.maxHp, target.hp + amount);
      if (c.use.curesBleed) this.removeStatus(target, 'bleed', ev);
      ev.push({ type: 'useItem', unit: u.id, item: stack.id, target: target.id });
      ev.push({ type: 'heal', unit: target.id, by: u.id, amount });
    } else if (c.use.type === 'cure') {
      u.ap -= cost;
      for (const s of c.use.statuses) this.removeStatus(u, s, ev);
      ev.push({ type: 'useItem', unit: u.id, item: stack.id });
    } else if (c.use.type === 'bomb') {
      if (!at) return;
      if (dist(u.pos, at) > c.use.range + 0.45 || !hasLos(this.grid, u.pos, at)) return;
      u.ap -= cost;
      ev.push({ type: 'throw', unit: u.id, item: stack.id, at });
      this.explode(u, at, c.use.aoe, c.use.dmg, ev);
    }
    stack.count--;
    if (stack.count <= 0) u.quick[slot] = null;
  }

  private doOpenDoor(u: UnitState, at: Vec2, ev: BattleEvent[]): void {
    if (u.ap < AP_COSTS.openDoor) return;
    if (this.grid.kindAt(at.x, at.y) !== 'door') return;
    if (dist(u.pos, at) > 1.45) return;
    const key = v2key(at);
    if (this.state.openDoors.includes(key)) return;
    u.ap -= AP_COSTS.openDoor;
    this.state.openDoors.push(key);
    this.grid.setDoorsOpen(this.state.openDoors);
    ev.push({ type: 'door', at, open: true });
  }

  private doSwap(u: UnitState, ev: BattleEvent[]): void {
    if (!u.spareWeaponId || u.ap < AP_COSTS.swap) return;
    u.ap -= AP_COSTS.swap;
    const w = u.weaponId;
    const l = u.loaded;
    u.weaponId = u.spareWeaponId;
    u.spareWeaponId = w;
    u.loaded = u.spareLoaded;
    u.spareLoaded = l;
    ev.push({ type: 'swap', unit: u.id, weapon: u.weaponId });
  }

  private doTransfer(u: UnitState, toId: string, itemId: string, ev: BattleEvent[]): void {
    if (u.ap < AP_COSTS.transfer) return;
    const to = this.unit(toId);
    if (to.down || to.side !== u.side || dist(u.pos, to.pos) > 1.45) return;
    const slotIdx = u.quick.findIndex((s) => s && s.id === itemId);
    if (slotIdx < 0) return;
    const freeIdx = to.quick.findIndex((s) => s === null || (s.id === itemId && !!itemDef(itemId).stack));
    if (freeIdx < 0) return;
    u.ap -= AP_COSTS.transfer;
    const stack = u.quick[slotIdx]!;
    stack.count--;
    if (stack.count <= 0) u.quick[slotIdx] = null;
    const dst = to.quick[freeIdx];
    if (dst && dst.id === itemId) dst.count++;
    else to.quick[freeIdx] = { id: itemId, count: 1 };
    ev.push({ type: 'transfer', from: u.id, to: toId, item: itemId });
  }

  private doSurge(u: UnitState, ev: BattleEvent[]): void {
    if (!hasPerk(u, 'surge') || this.battleFlags.has('surge_' + u.id)) return;
    this.battleFlags.add('surge_' + u.id);
    this.battleFlags.add('surge_debt_' + u.id);
    u.ap += 4;
    ev.push({ type: 'secondWind', unit: u.id });
  }

  private doPass(u: UnitState, ev: BattleEvent[]): void {
    const banked = Math.min(AP_COSTS.passBankMax, u.ap);
    u.passBank = banked;
    ev.push({ type: 'pass', unit: u.id, banked });
    this.nextTurn(ev);
  }

  // ---------- Урон, статусы ----------

  applyDamage(
    target: UnitState,
    dmg: number,
    source: UnitState | null,
    ev: BattleEvent[],
    kind?: 'fire' | 'bleed' | 'thorns',
  ): { killed: boolean; downed: boolean } {
    let real = dmg;
    // Несгибаемый: раз за бой вместо нокаута остаёшься с 1 HP
    if (target.hp - real <= 0 && hasPerk(target, 'unbroken') && !this.battleFlags.has('unbroken_' + target.id)) {
      this.battleFlags.add('unbroken_' + target.id);
      real = target.hp - 1;
    }
    target.hp -= real;
    // Кровник: пометить врага, ранившего союзника
    if (source && source.side === 'enemy' && target.side === 'player') {
      for (const ally of this.state.units) {
        if (ally.side === 'player' && !ally.down && hasPerk(ally, 'blood_feud') && !ally.marks.includes(source.id))
          ally.marks.push(source.id);
      }
    }
    // Последний вздох
    if (
      target.amuletId === 'amulet_breath' &&
      !target.amuletUsed &&
      target.hp > 0 &&
      target.hp <= Math.floor(target.maxHp / 3)
    ) {
      target.amuletUsed = true;
      target.ap += 3;
      ev.push({ type: 'secondWind', unit: target.id });
    }
    let killed = false;
    let downed = false;
    if (target.hp <= 0) {
      target.hp = 0;
      target.down = true;
      target.statuses = [];
      if (target.side === 'enemy') {
        killed = true;
        this.state.xpAwarded += target.xpValue;
        if (target.aiRole === 'leader') {
          this.state.leaderDead = true;
          this.applyMoraleBreak(ev);
        }
      } else {
        downed = true;
      }
      const idx = this.state.order.indexOf(target.id);
      if (idx >= 0) {
        this.state.order.splice(idx, 1);
        if (idx < this.state.turnIdx) this.state.turnIdx--;
        else if (idx === this.state.turnIdx) this.state.turnIdx--; // ход всё равно сменится
      }
    }
    if (kind) ev.push({ type: 'damage', unit: target.id, amount: real, source: kind, killed, downed });
    return { killed, downed };
  }

  /** мораль: гибель вожака — рядовые с Волей < 4 теряют следующий ход */
  private applyMoraleBreak(ev: BattleEvent[]): void {
    for (const u of this.state.units) {
      if (u.side === 'enemy' && !u.down && u.aiRole !== 'leader' && effStat(u, 'wil') < 4) {
        u.panicked = true;
        ev.push({ type: 'panic', unit: u.id });
      }
    }
  }

  addStatus(u: UnitState, kind: StatusKind, turns: number, ev: BattleEvent[]): void {
    // Воля сопротивляется оглушению
    if (kind === 'stun' && effStat(u, 'wil') >= 8) return;
    const exist = u.statuses.find((s) => s.kind === kind);
    if (exist) exist.turns = Math.max(exist.turns, turns);
    else {
      u.statuses.push({ kind, turns });
      ev.push({ type: 'status', unit: u.id, status: kind, on: true });
    }
  }

  removeStatus(u: UnitState, kind: StatusKind, ev: BattleEvent[]): void {
    const i = u.statuses.findIndex((s) => s.kind === kind);
    if (i >= 0) {
      u.statuses.splice(i, 1);
      ev.push({ type: 'status', unit: u.id, status: kind, on: false });
    }
  }

  fireAt(p: Vec2): boolean {
    return this.state.fire.some((f) => f.x === p.x && f.y === p.y && f.turns > 0);
  }

  // ---------- Ходы ----------

  /** запустить бой (первый ход) */
  begin(): BattleEvent[] {
    const ev: BattleEvent[] = [];
    this.state.round = 1;
    this.state.turnIdx = -1;
    this.nextTurn(ev);
    this.syncRng();
    return ev;
  }

  endTurn(): BattleEvent[] {
    const ev: BattleEvent[] = [];
    const u = this.activeUnit();
    if (u) {
      u.passBank = 0;
    }
    this.nextTurn(ev);
    this.syncRng();
    this.checkEnd(ev);
    return ev;
  }

  private nextTurn(ev: BattleEvent[]): void {
    if (this.state.result) return;
    for (let guard = 0; guard < this.state.order.length + 2; guard++) {
      this.state.turnIdx++;
      if (this.state.turnIdx >= this.state.order.length) {
        this.state.turnIdx = 0;
        this.state.round++;
        this.tickFire(ev);
      }
      const u = this.activeUnit();
      if (!u || u.down) continue;
      // оглушение: пропуск активации
      if (hasStatus(u, 'stun')) {
        this.tickStatuses(u, ev, true);
        continue;
      }
      if (u.panicked) {
        u.panicked = false;
        ev.push({ type: 'panic', unit: u.id });
        continue;
      }
      // начало хода
      u.ap = maxAp(u) + u.passBank;
      u.passBank = 0;
      if (this.battleFlags.has('surge_debt_' + u.id)) {
        this.battleFlags.delete('surge_debt_' + u.id);
        u.ap = Math.max(0, u.ap - 2);
      }
      u.maraudUsed = false;
      this.battleFlags.delete('swagger_t_' + u.id);
      this.tickStatuses(u, ev, false);
      if (u.down) continue; // умер от кровотечения/огня
      // стоя в огне — горишь
      if (this.fireAt(u.pos)) this.addStatus(u, 'burn', 2, ev);
      ev.push({ type: 'turnStart', unit: u.id, round: this.state.round });
      return;
    }
  }

  private tickStatuses(u: UnitState, ev: BattleEvent[], stunnedSkip: boolean): void {
    for (const s of [...u.statuses]) {
      if (s.kind === 'bleed') {
        this.applyDamage(u, BLEED_DMG, null, ev, 'bleed');
      } else if (s.kind === 'burn') {
        this.applyDamage(u, BURN_DMG, null, ev, 'fire');
      }
      s.turns--;
      if (s.turns <= 0) this.removeStatus(u, s.kind, ev);
    }
    if (stunnedSkip) {
      // статус уже оттикал; активация пропущена
    }
  }

  private tickFire(ev: BattleEvent[]): void {
    const out: Vec2[] = [];
    for (const f of this.state.fire) {
      f.turns--;
      if (f.turns <= 0) out.push({ x: f.x, y: f.y });
    }
    this.state.fire = this.state.fire.filter((f) => f.turns > 0);
    if (out.length) ev.push({ type: 'fireOut', cells: out });
  }

  private checkEnd(ev: BattleEvent[]): void {
    if (this.state.result) return;
    const playersUp = this.state.units.some((u) => u.side === 'player' && !u.down);
    const enemiesUp = this.state.units.some((u) => u.side === 'enemy' && !u.down);
    if (!enemiesUp) {
      this.state.result = 'victory';
      ev.push({ type: 'xp', amount: this.state.xpAwarded });
      ev.push({ type: 'battleEnd', result: 'victory' });
    } else if (!playersUp) {
      this.state.result = 'defeat';
      ev.push({ type: 'battleEnd', result: 'defeat' });
    }
  }
}
