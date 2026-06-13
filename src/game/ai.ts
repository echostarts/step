import type { Battle } from './combat';
import { neighbors4 } from './grid';
import { hasLos } from './los';
import { findPath, pathTo } from './pathfind';
import type { BattleEvent, UnitState, Vec2 } from './types';
import { dist, v2key } from './types';
import { weaponOf } from './unit';

/**
 * ИИ врага — конечный автомат.
 * Приоритет целей: раненые > фланговая позиция > ближайший.
 * Правило укрытия: стрелок не заканчивает ход в чистом поле, если в радиусе
 * хода есть клетка с укрытием и LOS на цель.
 * Клетки назначения резервируются между юнитами — никакой толпы в дверях.
 */
export class EnemyAI {
  /** клетки, занятые планами других врагов в этом раунде */
  private reserved = new Set<string>();
  private lastRound = -1;

  takeTurn(battle: Battle, unit: UnitState): BattleEvent[] {
    if (battle.state.round !== this.lastRound) {
      this.reserved.clear();
      this.lastRound = battle.state.round;
    }
    const ev: BattleEvent[] = [];
    let guard = 24;
    while (!battle.state.result && battle.activeUnit()?.id === unit.id && guard-- > 0) {
      const acted = this.step(battle, unit, ev);
      if (!acted) break;
    }
    if (!battle.state.result && battle.activeUnit()?.id === unit.id) {
      ev.push(...battle.perform({ type: 'pass' }));
    }
    return ev;
  }

  /** одно решение; false — больше нечего делать */
  private step(battle: Battle, u: UnitState, ev: BattleEvent[]): boolean {
    const targets = this.visibleTargets(battle, u);
    const w = weaponOf(u);

    // нет видимых целей — идём к ближайшему игроку (по знанию карты)
    if (targets.length === 0) {
      const nearest = this.nearestPlayer(battle, u);
      if (!nearest) return false;
      return this.moveToward(battle, u, nearest.pos, ev);
    }

    // алхимик: скопление 2+ бойцов — огонь
    if (u.aiRole === 'alchemist' && w.aoe && u.ap >= w.apLight) {
      const cell = this.bestBombCell(battle, u, w.range);
      if (cell) {
        const before = u.ap;
        ev.push(...battle.perform({ type: 'attackArea', at: cell }));
        if (u.ap !== before) return true;
      }
    }

    const target = this.pickTarget(battle, u, targets);
    if (!target) return false;

    if (w.wclass === 'melee') return this.meleeStep(battle, u, target, ev);
    return this.rangedStep(battle, u, target, ev);
  }

  private visibleTargets(battle: Battle, u: UnitState): UnitState[] {
    return battle.state.units.filter(
      (p) => p.side === 'player' && !p.down && hasLos(battle.grid, u.pos, p.pos),
    );
  }

  private nearestPlayer(battle: Battle, u: UnitState): UnitState | null {
    let best: UnitState | null = null;
    let bd = Infinity;
    for (const p of battle.state.units) {
      if (p.side !== 'player' || p.down) continue;
      const d = dist(u.pos, p.pos);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  /** раненые > фланг > ближайший */
  private pickTarget(battle: Battle, u: UnitState, targets: UnitState[]): UnitState | null {
    let best: UnitState | null = null;
    let bestScore = -Infinity;
    for (const t of targets) {
      let score = 0;
      score += (1 - t.hp / t.maxHp) * 100; // раненые приоритетнее
      const { cover, flanked } = battle.coverAgainst(u.pos, t);
      if (flanked || cover === 'none') score += 30;
      score -= dist(u.pos, t.pos) * 2;
      if (score > bestScore) {
        bestScore = score;
        best = t;
      }
    }
    return best;
  }

  private bestBombCell(battle: Battle, u: UnitState, range: number): Vec2 | null {
    let best: Vec2 | null = null;
    let bestCount = 1;
    for (const p of battle.state.units) {
      if (p.side !== 'player' || p.down) continue;
      if (dist(u.pos, p.pos) > range + 0.45) continue;
      if (!hasLos(battle.grid, u.pos, p.pos)) continue;
      // считаем игроков в 3х3 вокруг кандидата
      let count = 0;
      for (const q of battle.state.units) {
        if (q.side !== 'player' || q.down) continue;
        if (Math.abs(q.pos.x - p.pos.x) <= 1 && Math.abs(q.pos.y - p.pos.y) <= 1) count++;
      }
      // не кидаем себе под ноги
      if (Math.abs(u.pos.x - p.pos.x) <= 1 && Math.abs(u.pos.y - p.pos.y) <= 1) continue;
      if (count > bestCount) {
        bestCount = count;
        best = { ...p.pos };
      }
    }
    return bestCount >= 2 ? best : null;
  }

  private meleeStep(battle: Battle, u: UnitState, target: UnitState, ev: BattleEvent[]): boolean {
    const w = weaponOf(u);
    // уже в досягаемости — бьём
    if (dist(u.pos, target.pos) <= w.range + 0.45 && u.ap >= w.apLight) {
      const before = u.ap;
      ev.push(...battle.perform({ type: 'attack', target: target.id, mode: 'light' }));
      return u.ap !== before;
    }
    // ищем клетку рядом с целью; фланкер предпочитает фланговую
    const reach = battle.reachableFor(u);
    let best: Vec2 | null = null;
    let bestScore = -Infinity;
    for (const n of neighbors4(target.pos)) {
      const key = v2key(n);
      if (this.reserved.has(key)) continue;
      const entry = reach.get(key);
      if (!entry) continue;
      let score = -entry.cost;
      if (u.aiRole === 'flanker') {
        const { cover, flanked } = battle.coverAgainst(n, target);
        if (flanked || cover === 'none') score += 20;
      }
      if (score > bestScore) {
        bestScore = score;
        best = n;
      }
    }
    if (best) {
      this.reserved.add(v2key(best));
      const before = u.ap;
      ev.push(...battle.perform({ type: 'move', to: best }));
      if (u.ap === before) return false;
      // добиваем, если хватает ОД
      return true;
    }
    // не дотягиваемся — шаг навстречу
    return this.moveToward(battle, u, target.pos, ev);
  }

  private rangedStep(battle: Battle, u: UnitState, target: UnitState, ev: BattleEvent[]): boolean {
    const w = weaponOf(u);
    // перезарядка при пустом магазине
    if (w.clip && u.loaded <= 0) {
      if (u.ap >= (w.reloadAp ?? 2) && battle.countAmmo(u, w.ammoId!) > 0) {
        const before = u.ap;
        ev.push(...battle.perform({ type: 'reload' }));
        return u.ap !== before;
      }
      // нечем стрелять — отступаем к укрытию
      return this.seekCover(battle, u, target, ev);
    }
    // можно стрелять?
    if (!battle.canAttack(u, target, 'light')) {
      // правило укрытия: если стоим в открытую и есть укрытие с LOS — сначала туда
      const myCover = battle.coverAgainst(target.pos, u);
      if (myCover.cover === 'none' && u.ap > w.apLight) {
        if (this.seekCover(battle, u, target, ev)) return true;
      }
      const before = u.ap;
      ev.push(...battle.perform({ type: 'attack', target: target.id, mode: 'light' }));
      return u.ap !== before;
    }
    // не можем стрелять отсюда — двигаемся к позиции с LOS и укрытием
    if (this.seekCover(battle, u, target, ev)) return true;
    return this.moveToward(battle, u, target.pos, ev);
  }

  /** найти в радиусе хода клетку с укрытием от цели и LOS на неё */
  private seekCover(battle: Battle, u: UnitState, target: UnitState, ev: BattleEvent[]): boolean {
    const w = weaponOf(u);
    const reach = battle.reachableFor(u);
    let best: Vec2 | null = null;
    let bestScore = -Infinity;
    for (const [key, entry] of reach) {
      if (this.reserved.has(key)) continue;
      const [x, y] = key.split(',').map(Number);
      const cell = { x, y };
      if (!hasLos(battle.grid, cell, target.pos)) continue;
      const d = dist(cell, target.pos);
      if (d > w.range) continue;
      const { cover } = battle.coverAgainst(target.pos, { ...u, pos: cell } as UnitState);
      let score = 0;
      if (cover === 'half') score += 30;
      else if (cover === 'full') score += 20; // полное мешает и стрелять — чуть ниже
      else continue; // без укрытия не интересно
      score -= entry.cost * 2;
      if (w.optimal) score -= Math.abs(d - w.optimal);
      if (score > bestScore) {
        bestScore = score;
        best = cell;
      }
    }
    if (!best) return false;
    this.reserved.add(v2key(best));
    const before = u.ap;
    ev.push(...battle.perform({ type: 'move', to: best }));
    return u.ap !== before;
  }

  private moveToward(battle: Battle, u: UnitState, goal: Vec2, ev: BattleEvent[]): boolean {
    if (u.ap <= 0) return false;
    const occupied = battle.occupied(u.id);
    const path = findPath(battle.grid, u.pos, goal, occupied, true);
    if (!path || path.length === 0) return false;
    const reach = battle.reachableFor(u);
    // самая дальняя точка пути, достижимая за этот ход и не зарезервированная
    let dest: Vec2 | null = null;
    for (let i = Math.min(path.length, u.ap) - 1; i >= 0; i--) {
      const key = v2key(path[i]);
      if (reach.has(key) && !this.reserved.has(key)) {
        dest = path[i];
        break;
      }
    }
    if (!dest) return false;
    this.reserved.add(v2key(dest));
    const before = u.ap;
    ev.push(...battle.perform({ type: 'move', to: dest }));
    return u.ap !== before;
  }
}
