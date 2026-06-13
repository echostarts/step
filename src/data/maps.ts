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

export const MAPS: Record<string, MapDef> = {
  outskirts: MAP_OUTSKIRTS,
};

export function mapDef(id: string): MapDef {
  const def = MAPS[id];
  if (!def) throw new Error('Unknown map: ' + id);
  return def;
}
