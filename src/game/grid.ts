import type { CellKind, MapDef, Vec2 } from './types';
import { v2key } from './types';

/**
 * Легенда ascii-карт:
 *  ' '  пустота (за пределами уровня)
 *  '.'  пол (камень)
 *  ','  пол (земля)
 *  '_'  пол (дерево)
 *  '#'  стена — блокирует движение и LOS, полное укрытие
 *  'D'  дверь (закрыта) — как стена, пока не открыта; открыть 1 ОД
 *  'b'  бочка — полуукрытие, блокирует движение
 *  'x'  ящик — полуукрытие, блокирует движение
 *  'f'  изгородь/барьер — полуукрытие, блокирует движение
 *  'T'  стол — полуукрытие, блокирует движение
 *  'C'  сундук — полуукрытие, лутается
 *  'R'  обломки — полуукрытие
 *  '@'  пол + точка появления игроков (порядок чтения)
 *  цифры 1-9 — пол + точки появления групп врагов (группа = цифра)
 */

const HALF_COVER_CHARS = new Set(['b', 'x', 'f', 'T', 'C', 'R']);
const FLOOR_CHARS = new Set(['.', ',', '_', '@']);

export class Grid {
  readonly w: number;
  readonly h: number;
  private kinds: CellKind[];
  private chars: string[];
  /** открытые двери — мутируются боем через setDoorOpen */
  private openDoorSet = new Set<string>();

  constructor(public def: MapDef) {
    this.h = def.rows.length;
    this.w = Math.max(...def.rows.map((r) => r.length));
    this.kinds = new Array(this.w * this.h).fill('void');
    this.chars = new Array(this.w * this.h).fill(' ');
    for (let y = 0; y < this.h; y++) {
      const row = def.rows[y];
      for (let x = 0; x < this.w; x++) {
        const ch = x < row.length ? row[x] : ' ';
        this.chars[y * this.w + x] = ch;
        this.kinds[y * this.w + x] = Grid.charKind(ch);
      }
    }
  }

  static charKind(ch: string): CellKind {
    if (ch === ' ') return 'void';
    if (ch === '#') return 'wall';
    if (ch === 'D') return 'door';
    if (HALF_COVER_CHARS.has(ch)) return 'cover_half';
    if (FLOOR_CHARS.has(ch) || /[0-9]/.test(ch)) return 'floor';
    return 'floor';
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  kindAt(x: number, y: number): CellKind {
    if (!this.inBounds(x, y)) return 'void';
    return this.kinds[y * this.w + x];
  }

  charAt(x: number, y: number): string {
    if (!this.inBounds(x, y)) return ' ';
    return this.chars[y * this.w + x];
  }

  setDoorsOpen(open: string[]): void {
    this.openDoorSet = new Set(open);
  }

  isDoorOpen(x: number, y: number): boolean {
    return this.openDoorSet.has(x + ',' + y);
  }

  /** проходима ли клетка (без учёта юнитов) */
  walkable(x: number, y: number): boolean {
    const k = this.kindAt(x, y);
    if (k === 'floor') return true;
    if (k === 'door') return this.isDoorOpen(x, y);
    return false;
  }

  /** блокирует ли клетка линию видимости */
  blocksSight(x: number, y: number): boolean {
    const k = this.kindAt(x, y);
    if (k === 'wall') return true;
    if (k === 'door') return !this.isDoorOpen(x, y);
    return false; // полуукрытия не мешают видеть
  }

  /** укрытие, которое даёт клетка стоящему ЗА ней */
  coverValue(x: number, y: number): 'none' | 'half' | 'full' {
    const k = this.kindAt(x, y);
    if (k === 'wall') return 'full';
    if (k === 'door') return this.isDoorOpen(x, y) ? 'none' : 'full';
    if (k === 'cover_half') return 'half';
    return 'none';
  }

  /** клетки появления игроков, в порядке чтения */
  playerSpawns(): Vec2[] {
    if (this.def.playerSpawns.length) return this.def.playerSpawns;
    const out: Vec2[] = [];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) if (this.charAt(x, y) === '@') out.push({ x, y });
    return out;
  }

  enemySpawns(group: string): Vec2[] {
    const fromDef = this.def.enemySpawns?.[group];
    if (fromDef?.length) return fromDef;
    const out: Vec2[] = [];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) if (this.charAt(x, y) === group) out.push({ x, y });
    return out;
  }

  /** все дверные клетки */
  doors(): Vec2[] {
    const out: Vec2[] = [];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) if (this.kindAt(x, y) === 'door') out.push({ x, y });
    return out;
  }
}

export const DIRS4: Vec2[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

export function neighbors4(p: Vec2): Vec2[] {
  return DIRS4.map((d) => ({ x: p.x + d.x, y: p.y + d.y }));
}

export function cellsKey(cells: Vec2[]): Set<string> {
  return new Set(cells.map(v2key));
}
