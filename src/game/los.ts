import type { Grid } from './grid';
import type { Vec2 } from './types';

/**
 * Линия видимости по сетке: «суперпокрытие» — перечисляем все клетки,
 * через которые проходит отрезок между центрами. Диагональное касание
 * угла не считается прохождением через обе боковые клетки (видно «по углам»,
 * но не сквозь шов двух стен — шов проверяется парой).
 */
export function lineCells(a: Vec2, b: Vec2): Vec2[] {
  const cells: Vec2[] = [];
  let x = a.x;
  let y = a.y;
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  const sx = a.x < b.x ? 1 : -1;
  const sy = a.y < b.y ? 1 : -1;
  let err = dx - dy;
  for (;;) {
    cells.push({ x, y });
    if (x === b.x && y === b.y) break;
    const e2 = 2 * err;
    if (e2 > -dy && e2 < dx) {
      // строго диагональный шаг — луч режет угол: помечаем обе примыкающие
      // клетки как «касание» только если ОБЕ блокируют (проверка в hasLos)
      cells.push({ x: x + sx, y, _corner: true } as Vec2 & { _corner: boolean });
      cells.push({ x, y: y + sy, _corner: true } as Vec2 & { _corner: boolean });
      x += sx;
      y += sy;
      err += dx - dy; // -dy + dx
    } else if (e2 > -dy) {
      err -= dy;
      x += sx;
    } else {
      err += dx;
      y += sy;
    }
  }
  return cells;
}

/** есть ли прямая видимость между клетками (концы не учитываются как блокеры) */
export function hasLos(grid: Grid, a: Vec2, b: Vec2): boolean {
  const cells = lineCells(a, b);
  // соберём угловые пары: луч проходит сквозь шов, только если обе блокируют
  const corners: Vec2[] = [];
  for (const c of cells) {
    if ((c as { _corner?: boolean })._corner) {
      corners.push(c);
      continue;
    }
    if ((c.x === a.x && c.y === a.y) || (c.x === b.x && c.y === b.y)) continue;
    if (grid.blocksSight(c.x, c.y)) return false;
  }
  for (let i = 0; i + 1 < corners.length; i += 2) {
    const c1 = corners[i];
    const c2 = corners[i + 1];
    if (grid.blocksSight(c1.x, c1.y) && grid.blocksSight(c2.x, c2.y)) return false;
  }
  return true;
}

export const SIGHT_RADIUS = 12;

/** множество видимых клеток из точки (для тумана войны) */
export function visibleFrom(grid: Grid, from: Vec2, radius = SIGHT_RADIUS): Set<string> {
  const out = new Set<string>();
  const r2 = radius * radius;
  for (let y = Math.max(0, from.y - radius); y <= Math.min(grid.h - 1, from.y + radius); y++) {
    for (let x = Math.max(0, from.x - radius); x <= Math.min(grid.w - 1, from.x + radius); x++) {
      const dx = x - from.x;
      const dy = y - from.y;
      if (dx * dx + dy * dy > r2) continue;
      if (grid.kindAt(x, y) === 'void') continue;
      if (hasLos(grid, from, { x, y })) out.add(x + ',' + y);
    }
  }
  return out;
}
