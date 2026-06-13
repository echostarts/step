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

/** Деревня Чернолесье: исследование, три NPC, дверь часовни на севере. 48×32. */
export const MAP_VILLAGE: MapDef = {
  id: 'village',
  nameKey: 'map.village',
  ambient: 'village',
  rows: [
    'ffffffffffffffffffffffffffffffffffffffffffffffff',
    'f,,,,,,,,,,,,,,,,,#############,,,,,,,,,,,,,,,,f',
    'f,,,,,,,,,,,,,,,,,#...........#,,,,,,,,,,,,,,,,f',
    'f,,,,,,,,,,,,,,,,,#...........#,,,,,,,,,,,,,,,,f',
    'f,,,,,,,,,,,,,,,,,#...........#,,,,,,,,,,,,,,,,f',
    'f,,,,,,,,,,,,,,,,,#...........#,,,,,,,,,,,,,,,,f',
    'f,,,,,,,,,,,,,,,,,#...........#,,,,,,,,,,,,,,,,f',
    'f,,,,,,,,,,,,,,,,,#...........#,,,,,,,,,,,,,,,,f',
    'f,,,,,,,,,,,,,bb,,######D######,,b,,,,,,,,,,,,,f',
    'f,,#########,,,,,,,,,,,..,,,,,,,,,,,fffffffff,,f',
    'f,,#.......#,,,,,,,,,,,..,,,,,,,,,,,f,,,,,,,f,,f',
    'f,,#.......#,,,,,,,,,,,..,,,,,,,,,,,f,,,,,,,f,,f',
    'f,,#.......#,,,,,,,,,,,..,,,,,,,,,,,f,,,,,,,f,,f',
    'f,,#.......#,,,,,,,,,,,..,,,,,,,,,,,f,,,,,,,f,,f',
    'f,,#.......#,,,,,,,,,,,..,,,,,,,,,,,f,,,,,,,f,,f',
    'f,,####D####,,,,,,,,,,,..,,,,,,,,,,,f,,,,,,,f,,f',
    'f,,,,,,,,,,,,,,,,,,,,,,..,,,,,,,,,,,ffff,ffff,,f',
    'f,,,,,,,,,,,,,,,,,,,,,,..,,,,,,,,,,,,,,,,,,,,,,f',
    'f,,,,bb,,,,,,,,,,,,,,,,..,,,,,xx,,,,,,,,,,,,,,,f',
    'f,,,,,,,,,,,,,,,,,,,,,,..,,,,,,,,,,,,,,,,,,,,,,f',
    'f,,,,,,,,,,,........................,,,,b,,,,,,f',
    'f,,,,,,,,,,,........................,,,,,,,,,,,f',
    'f,,,,,,,,,,,,,,,,,,,,,,..,,,,,,,,,,,,,,,,,,,,,,f',
    'f,,,,,,,,,,,,f,,,,,,,,,..,,,,,,,,,,,,,,,,,,,,,,f',
    'f,,,,,,,b,,,,f,,xx,,,,,..,,,,,,,,,,,,,,,,,,,,,,f',
    'f,,,,,,,,,,,,f,,,,,,,,,..,,,,,,,,,,,,,,,,,,,,,,f',
    'f,,,,,,,,fffff,,,,,,,,,..,,,,,,,,,ffffff,,,,,,,f',
    'f,,,,,,,,,,,,,,,,,,,,,,..,,,,,,,,,,,,,,,,,,,,,,f',
    'f,,,,,,,,,,,,,,,,,,,,,,..,,,,,,,,,,,,,,,,,,,,,,f',
    'f,,,,,,,,,,,,,,,,,,,,,@.@,,,,,,,,,,,,,,,,,,,,,,f',
    'f,,,,,,,,,,,,,,,,,,,,,,@,@,,,,,,,,,,,,,,,,,,,,,f',
    'ffffffffffffffffffffffffffffffffffffffffffffffff',
  ],
  playerSpawns: [],
  props: [
    { model: 'torch_mounted', x: 23, y: 8, rot: 2 },
    { model: 'torch_mounted', x: 25, y: 8, rot: 2 },
    { model: 'candle_triple', x: 24, y: 3 },
    { model: 'shelf_small_candles', x: 19, y: 2 },
    { model: 'table_long_decorated_A', x: 24, y: 5 },
    { model: 'candle_lit', x: 6, y: 14 },
    { model: 'table_small_decorated_A', x: 8, y: 12 },
    { model: 'shelf_small', x: 4, y: 10 },
    { model: 'plate_food_B', x: 40, y: 11 },
    { model: 'keg_decorated', x: 42, y: 14 },
    { model: 'rubble_large', x: 44, y: 27, rot: 1 },
    { model: 'rubble_half', x: 4, y: 28 },
    { model: 'sword_shield_broken', x: 16, y: 20 },
    { model: 'trunk_medium_A', x: 27, y: 27 },
    { model: 'candle_lit', x: 26, y: 20 },
    { model: 'candle_lit', x: 12, y: 21 },
  ],
  lights: [
    { x: 23, y: 8, color: 0xff9944, intensity: 7 },
    { x: 25, y: 8, color: 0xff9944, intensity: 7 },
    { x: 24, y: 3, h: 2.4, color: 0x9955ee, intensity: 6 },
    { x: 6, y: 14, color: 0xffaa55, intensity: 4 },
    { x: 8, y: 12, color: 0xffaa55, intensity: 3 },
    { x: 40, y: 12, color: 0xffaa55, intensity: 4 },
    { x: 12, y: 21, color: 0xffaa55, intensity: 5 },
    { x: 26, y: 20, color: 0xff9944, intensity: 5 },
    { x: 30, y: 27, color: 0xffaa55, intensity: 4 },
  ],
  triggers: [{ x: 23, y: 9, w: 2, h: 1, event: 'chapel' }],
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
