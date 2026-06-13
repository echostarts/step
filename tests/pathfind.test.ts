import { describe, expect, it } from 'vitest';
import { Grid } from '../src/game/grid';
import { findPath, pathTo, reachable } from '../src/game/pathfind';
import type { MapDef } from '../src/game/types';

function makeGrid(rows: string[]): Grid {
  const def: MapDef = { id: 't', nameKey: 't', rows, playerSpawns: [] };
  return new Grid(def);
}

describe('Поиск пути', () => {
  it('reachable: стоимость 1 ОД за клетку, 4 направления', () => {
    const g = makeGrid(['.....', '.....', '.....']);
    const r = reachable(g, { x: 2, y: 1 }, 2, new Set());
    expect(r.get('3,1')!.cost).toBe(1);
    expect(r.get('4,1')!.cost).toBe(2);
    expect(r.get('3,2')!.cost).toBe(2); // по манхэттену
    expect(r.has('2,1')).toBe(false); // старт не входит
    expect(r.has('0,0')).toBe(false); // 3 ОД — недостижимо
  });

  it('стены и занятые клетки обходятся', () => {
    const g = makeGrid(['...', '.#.', '...']);
    const r = reachable(g, { x: 0, y: 1 }, 10, new Set(['0,0']));
    expect(r.has('1,1')).toBe(false); // стена
    expect(r.has('0,0')).toBe(false); // занято
    expect(r.get('2,1')!.cost).toBe(4); // в обход снизу
  });

  it('pathTo восстанавливает кратчайший путь', () => {
    const g = makeGrid(['...', '.#.', '...']);
    const r = reachable(g, { x: 0, y: 1 }, 10, new Set());
    const p = pathTo(r, { x: 2, y: 1 })!;
    expect(p.length).toBe(4);
    expect(p[p.length - 1]).toEqual({ x: 2, y: 1 });
  });

  it('закрытая дверь непроходима, открытая — проходима', () => {
    const g = makeGrid(['.D.']);
    let r = reachable(g, { x: 0, y: 0 }, 5, new Set());
    expect(r.has('2,0')).toBe(false);
    g.setDoorsOpen(['1,0']);
    r = reachable(g, { x: 0, y: 0 }, 5, new Set());
    expect(r.get('2,0')!.cost).toBe(2);
  });

  it('findPath goalAdjacent останавливается рядом с целью', () => {
    const g = makeGrid(['.....']);
    const p = findPath(g, { x: 0, y: 0 }, { x: 4, y: 0 }, new Set(), true)!;
    expect(p[p.length - 1]).toEqual({ x: 3, y: 0 });
  });

  it('findPath возвращает null, если пути нет', () => {
    const g = makeGrid(['..#..']);
    expect(findPath(g, { x: 0, y: 0 }, { x: 4, y: 0 }, new Set())).toBeNull();
  });
});
