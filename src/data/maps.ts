import type { MapDef } from '../game/types';

/**
 * Карты. ascii-легенда — см. grid.ts.
 * Группа врагов «1» — упыри пролога, «2» — культисты часовни и т.д.
 */

/** Бой 1: околица Чернолесья. Разорённый двор у въезда в деревню. */
export const MAP_OUTSKIRTS: MapDef = {
  id: 'outskirts',
  nameKey: 'map.outskirts',
  ambient: 'village',
  rows: [
    '############################',
    '#,,,,,,,,,,,,,,,1,,,,,,,,,,#',
    '#,,,,f,,,,,,,,,,,,,,,1,,,,,#',
    '#,,,,f,,,,####D####,,,,,,,,#',
    '#,,,,,,,,,#.......#,1,,,,,,#',
    '#,b,,,,,,,#...C...#,,,,,,,,#',
    '#,,,,,,,,,####.####,,,,,b,,#',
    '#,,,,,,,,,,,,,.,,,,,,,,,,,,#',
    '#,,,,x,,,,,,,,.,,,,,1,,,,,,#',
    '#,,,,,,,fff,,,.,,,,,,,,,,,,#',
    '#,,,,,,,,,,,,,.,,,,fff,,,,,#',
    '#,,,,,,,,,,,,,.,,,1,,,,,,,,#',
    '#,,,,,,,b,,,,,.,,,,,,,1,,,,#',
    '#,@,,,,,,,,,,,.,,,,,x,,,,,,#',
    '#,,@,,,,,,,,,,.,,,,,,,,,,,,#',
    '#,@,,,,,,,,,,,.,,,,,,,b,,,,#',
    '#,,@,,,,,,,,,,,,,,,,,,,,,,,#',
    '############################',
  ],
  playerSpawns: [],
  props: [
    { model: 'torch_mounted', x: 11, y: 3, rot: 2 },
    { model: 'torch_mounted', x: 16, y: 3, rot: 2 },
    { model: 'rubble_large', x: 24, y: 2 },
    { model: 'rubble_half', x: 3, y: 7 },
    { model: 'candle_lit', x: 12, y: 4 },
    { model: 'trunk_small_A', x: 25, y: 14 },
    { model: 'keg', x: 6, y: 12 },
    { model: 'plate_food_A', x: 17, y: 8 },
  ],
  lights: [
    { x: 11, y: 3, color: 0xff9944, intensity: 6 },
    { x: 16, y: 3, color: 0xff9944, intensity: 6 },
    { x: 12, y: 4, color: 0xffaa55, intensity: 3 },
  ],
  loot: [
    {
      x: 14,
      y: 5,
      nameKey: 'loot.chest',
      items: [
        { id: 'potion', count: 1 },
        { id: 'bolts', count: 6 },
      ],
    },
  ],
};

/** Деревня Чернолесье: исследование, три NPC, дверь часовни на севере. */
export const MAP_VILLAGE: MapDef = {
  id: 'village',
  nameKey: 'map.village',
  ambient: 'village',
  rows: [
    'ffffffffffffffffffffffffffffffffffffffff',
    'f,,,,,,,,,,,,,############,,,,,,,,,,,,,f',
    'f,,,,,,,,,,,,,#..........#,,,,,,,,,,,,,f',
    'f,,,,,,,,,,,,,#..........#,,,,,,,,,,,,,f',
    'f,b,,,,,,,,,,,#..........#,,,,,,,,,,,,,f',
    'f,,,,,,,,,,,,,#..........#,,,,b,,,,,,,,f',
    'f,,,,,,,,,,,,,#####D######,,,,,,,,,,,,,f',
    'f,,,,,,,,,,,,,,,,,,.,,,,,,,,,,,,,,,,,,,f',
    'f,,,,,,,,,,,,,,,,,,.,,,,,,,,,ffffff,,,,f',
    'f,,####D####,,,,,,,.,,,,,,,,,f,,,,f,,,,f',
    'f,,#.......#,,,,,,,.,,,,,,,,,f,,,,f,,,,f',
    'f,,#.......#,,,,,,,.,,,,,,,,,f,,,,f,,,,f',
    'f,,#.......#,,,,,,,.,,,,,,,,,ffff,f,,,,f',
    'f,,#########,,,,,,,.,,,,,,,,,,,,,,,,,,,f',
    'f,,,,,,,,,,,,,,,,,,.,,,,x,,,,,,,,,,,,,,f',
    'f,,,,,,,,,,,,,,,,,,.,,,,x,,,,,,,,,,,,,,f',
    'f,b,,,,,,,,,,,,,,,,.,,,,,,,,,,,,b,,,,,,f',
    'f,,,,,ffff,,,,,,,,,.,,,,,,,,,,,,,,,,,,,f',
    'f,,,,,,,,,,,,,,,,@,.,@,,,,,,,,,,,,,,,,,f',
    'f,,,,,,,,,,,,,,,,,@.@,,,,,,fff,,,,,,,,,f',
    'f,,,,,,,,,,,,,,,,,,.,,,,,,,,,,,,,,,,,,,f',
    'f,,,,,,,,,,,,,,,,,,.,,,,,,,,,,,,,,,,,,,f',
    'f,,,,,,,,,,,,,,,,,,.,,,,,,,,,,,,,,,,,,,f',
    'f,,,,,,,,,,,,,,,,,,.,,,,,,,,,,,,,,,,,,,f',
    'f,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,f',
    'ffffffffffffffffffffffffffffffffffffffff',
  ],
  playerSpawns: [],
  props: [
    { model: 'torch_mounted', x: 18, y: 6, rot: 2 },
    { model: 'torch_mounted', x: 20, y: 6, rot: 2 },
    { model: 'candle_lit', x: 6, y: 10 },
    { model: 'keg_decorated', x: 22, y: 14 },
    { model: 'trunk_medium_A', x: 25, y: 16 },
    { model: 'plate_food_B', x: 31, y: 10 },
    { model: 'rubble_large', x: 35, y: 20, rot: 1 },
    { model: 'rubble_half', x: 5, y: 20 },
    { model: 'table_small_decorated_A', x: 8, y: 14 },
    { model: 'candle_triple', x: 8, y: 14 },
    { model: 'sword_shield_broken', x: 13, y: 18 },
    { model: 'candle_triple', x: 19, y: 20 },
    { model: 'candle_lit', x: 24, y: 14 },
  ],
  lights: [
    { x: 18, y: 6, color: 0xff9944, intensity: 7 },
    { x: 20, y: 6, color: 0xff9944, intensity: 7 },
    { x: 6, y: 10, color: 0xffaa55, intensity: 4 },
    { x: 8, y: 14, color: 0xffaa55, intensity: 3 },
    { x: 11, y: 3, h: 5, color: 0x8a66cc, intensity: 5 },
    { x: 24, y: 14, color: 0xffaa55, intensity: 5 },
    { x: 31, y: 11, color: 0xff9944, intensity: 4 },
    { x: 19, y: 20, color: 0xffaa55, intensity: 5 },
  ],
  triggers: [{ x: 18, y: 7, w: 3, h: 1, event: 'chapel' }],
};

/** Часовня Пепельного Древа: Бой 2 и финал. */
export const MAP_CHAPEL: MapDef = {
  id: 'chapel',
  nameKey: 'map.chapel',
  ambient: 'chapel',
  rows: [
    '########################',
    '#......................#',
    '#..bb....,....,....bb..#',
    '#........,.3..,........#',
    '#..#.....,....,.....#..#',
    '#....1...,.2..,...1....#',
    '#........,....,........#',
    '#..#......1.........#..#',
    '#..T..T........T..T....#',
    '#......................#',
    '#..#....1.......1...#..#',
    '#..T..T........T..T....#',
    '#......................#',
    '#..#.....@..@.......#..#',
    '#.........@..@.........#',
    '#########D##############',
  ],
  playerSpawns: [],
  props: [
    { model: 'chest_gold', x: 11, y: 2 },
    { model: 'candle_triple', x: 9, y: 2 },
    { model: 'candle_triple', x: 13, y: 2 },
    { model: 'candle_lit', x: 6, y: 8 },
    { model: 'candle_lit', x: 17, y: 11 },
    { model: 'banner_patternA_red', x: 4, y: 1, rot: 2 },
    { model: 'banner_patternA_red', x: 19, y: 1, rot: 2 },
    { model: 'shelf_small_candles', x: 1, y: 1 },
    { model: 'bottle_A_brown', x: 6, y: 8 },
  ],
  lights: [
    { x: 11, y: 2, h: 2.2, color: 0x9955ee, intensity: 9 },
    { x: 9, y: 2, color: 0xffaa55, intensity: 4 },
    { x: 13, y: 2, color: 0xffaa55, intensity: 4 },
    { x: 6, y: 8, color: 0xffaa55, intensity: 3.5 },
    { x: 17, y: 11, color: 0xffaa55, intensity: 3.5 },
  ],
  loot: [],
};

export const MAPS: Record<string, MapDef> = {
  outskirts: MAP_OUTSKIRTS,
  village: MAP_VILLAGE,
  chapel: MAP_CHAPEL,
};

export function mapDef(id: string): MapDef {
  const def = MAPS[id];
  if (!def) throw new Error('Unknown map: ' + id);
  return def;
}
