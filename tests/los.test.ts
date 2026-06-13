import { describe, expect, it } from 'vitest';
import { Grid } from '../src/game/grid';
import { hasLos, visibleFrom } from '../src/game/los';
import type { MapDef } from '../src/game/types';

function makeGrid(rows: string[]): Grid {
  const def: MapDef = { id: 't', nameKey: 't', rows, playerSpawns: [] };
  return new Grid(def);
}

describe('LOS', () => {
  it('видит по прямой через пустое поле', () => {
    const g = makeGrid(['.....', '.....', '.....']);
    expect(hasLos(g, { x: 0, y: 0 }, { x: 4, y: 2 })).toBe(true);
  });

  it('стена блокирует', () => {
    const g = makeGrid(['.....', '..#..', '.....']);
    expect(hasLos(g, { x: 0, y: 1 }, { x: 4, y: 1 })).toBe(false);
  });

  it('полуукрытие не блокирует', () => {
    const g = makeGrid(['.....', '..b..', '.....']);
    expect(hasLos(g, { x: 0, y: 1 }, { x: 4, y: 1 })).toBe(true);
  });

  it('закрытая дверь блокирует, открытая — нет', () => {
    const g = makeGrid(['.....', '..D..', '.....']);
    expect(hasLos(g, { x: 0, y: 1 }, { x: 4, y: 1 })).toBe(false);
    g.setDoorsOpen(['2,1']);
    expect(hasLos(g, { x: 0, y: 1 }, { x: 4, y: 1 })).toBe(true);
  });

  it('не видит сквозь шов двух стен по диагонали', () => {
    const g = makeGrid(['.#.', '#..', '...']);
    expect(hasLos(g, { x: 0, y: 0 }, { x: 2, y: 2 })).toBe(false);
  });

  it('видит мимо угла одной стены', () => {
    const g = makeGrid(['.#.', '...', '...']);
    expect(hasLos(g, { x: 0, y: 0 }, { x: 2, y: 2 })).toBe(true);
  });

  it('концы отрезка не считаются блокерами', () => {
    const g = makeGrid(['.....']);
    expect(hasLos(g, { x: 0, y: 0 }, { x: 4, y: 0 })).toBe(true);
  });

  it('visibleFrom: за стеной темно, радиус соблюдается', () => {
    const g = makeGrid(['..........', '..#.......', '..........']);
    const vis = visibleFrom(g, { x: 0, y: 1 }, 5);
    expect(vis.has('1,1')).toBe(true);
    expect(vis.has('3,1')).toBe(false); // прямо за стеной
    expect(vis.has('9,1')).toBe(false); // вне радиуса
  });
});
