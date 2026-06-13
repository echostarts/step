import type { Grid } from './grid';
import { DIRS4 } from './grid';
import type { Vec2 } from './types';
import { v2key } from './types';

export interface ReachEntry {
  cost: number;
  from: string | null; // ключ предыдущей клетки
}

/**
 * BFS по 4 направлениям, 1 ОД за клетку. occupied — клетки юнитов
 * (непроходимы, кроме стартовой).
 */
export function reachable(
  grid: Grid,
  start: Vec2,
  maxCost: number,
  occupied: Set<string>,
): Map<string, ReachEntry> {
  const out = new Map<string, ReachEntry>();
  const startKey = v2key(start);
  out.set(startKey, { cost: 0, from: null });
  let frontier: Vec2[] = [start];
  let cost = 0;
  while (frontier.length && cost < maxCost) {
    cost++;
    const next: Vec2[] = [];
    for (const p of frontier) {
      for (const d of DIRS4) {
        const nx = p.x + d.x;
        const ny = p.y + d.y;
        const key = nx + ',' + ny;
        if (out.has(key)) continue;
        if (!grid.walkable(nx, ny)) continue;
        if (occupied.has(key)) continue;
        out.set(key, { cost, from: v2key(p) });
        next.push({ x: nx, y: ny });
      }
    }
    frontier = next;
  }
  out.delete(startKey);
  return out;
}

/** восстановить путь из карты достижимости (не включает старт) */
export function pathTo(reach: Map<string, ReachEntry>, to: Vec2): Vec2[] | null {
  const toKey = v2key(to);
  if (!reach.has(toKey)) return null;
  const path: Vec2[] = [];
  let cur: string | null = toKey;
  while (cur) {
    const [x, y] = cur.split(',').map(Number);
    path.push({ x, y });
    const entry: ReachEntry | undefined = reach.get(cur);
    cur = entry ? entry.from : null;
  }
  path.pop(); // старт не включаем
  path.reverse();
  return path;
}

/**
 * Поиск пути без лимита (для ИИ): BFS до цели, возвращает путь или null.
 * goalAdjacent — искать путь до клетки, СОСЕДНЕЙ с целью.
 */
export function findPath(
  grid: Grid,
  start: Vec2,
  goal: Vec2,
  occupied: Set<string>,
  goalAdjacent = false,
): Vec2[] | null {
  const isGoal = (x: number, y: number) =>
    goalAdjacent
      ? Math.abs(x - goal.x) + Math.abs(y - goal.y) === 1
      : x === goal.x && y === goal.y;
  if (isGoal(start.x, start.y)) return [];
  const visited = new Map<string, string | null>();
  visited.set(v2key(start), null);
  let frontier: Vec2[] = [start];
  let found: string | null = null;
  while (frontier.length && !found) {
    const next: Vec2[] = [];
    for (const p of frontier) {
      for (const d of DIRS4) {
        const nx = p.x + d.x;
        const ny = p.y + d.y;
        const key = nx + ',' + ny;
        if (visited.has(key)) continue;
        if (!grid.walkable(nx, ny)) continue;
        if (occupied.has(key)) continue;
        visited.set(key, v2key(p));
        if (isGoal(nx, ny)) {
          found = key;
          break;
        }
        next.push({ x: nx, y: ny });
      }
      if (found) break;
    }
    frontier = next;
  }
  if (!found) return null;
  const path: Vec2[] = [];
  let cur: string | null = found;
  while (cur) {
    const [x, y] = cur.split(',').map(Number);
    path.push({ x, y });
    cur = visited.get(cur) ?? null;
  }
  path.pop();
  path.reverse();
  return path;
}
