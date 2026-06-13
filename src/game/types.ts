/** Базовые типы игровой логики. Ни одной зависимости от рендера. */

export interface Vec2 {
  x: number;
  y: number;
}

export function v2(x: number, y: number): Vec2 {
  return { x, y };
}

export function v2key(p: Vec2): string {
  return p.x + ',' + p.y;
}

export function v2eq(a: Vec2, b: Vec2): boolean {
  return a.x === b.x && a.y === b.y;
}

export function manhattan(a: Vec2, b: Vec2): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function chebyshev(a: Vec2, b: Vec2): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/** евклидова дистанция (для дальнобойности) */
export function dist(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export type StatName = 'str' | 'dex' | 'wil' | 'int';

export interface Stats {
  str: number;
  dex: number;
  wil: number;
  int: number;
}

export type Side = 'player' | 'enemy';

export type StatusKind = 'bleed' | 'burn' | 'stun';

export interface StatusInst {
  kind: StatusKind;
  turns: number; // сколько ходов осталось
}

// ---------- Предметы ----------

export type ItemKind = 'weapon' | 'armor' | 'amulet' | 'consumable' | 'ammo' | 'quest';

export interface ItemBase {
  id: string;
  kind: ItemKind;
  nameKey: string;
  descKey: string;
  icon: string;
  weight: number;
  stack?: boolean;
}

export type WeaponClass = 'melee' | 'ranged' | 'thrown';

export interface WeaponDef extends ItemBase {
  kind: 'weapon';
  wclass: WeaponClass;
  dmg: { n: number; d: number; plus: number };
  dmgStat: 'str' | 'dex';
  baseAcc: number;
  range: number; // в клетках (евклидово)
  optimal?: number; // для дальнего: дальше — штраф к точности
  apLight: number;
  apHeavy?: number; // если есть тяжёлая атака
  ammoId?: string; // боезапас
  clip?: number; // выстрелов до перезарядки
  reloadAp?: number;
  aoe?: { size: number; igniteTurns: number; fireDmg: number }; // size=3 => 3x3
  model: string | null; // ключ модели в руке (null = без модели)
  twoHanded?: boolean;
  /** копьё: бьёт через клетку — range 2 у melee */
}

export interface ArmorDef extends ItemBase {
  kind: 'armor';
  armor: number; // плоское поглощение
  apPenalty?: number; // тяжёлая броня может резать ОД
}

export interface AmuletDef extends ItemBase {
  kind: 'amulet';
  /** триггерные свойства — обрабатываются движком по id */
  effect: 'second_wind' | 'thorn_pact';
}

export interface ConsumableDef extends ItemBase {
  kind: 'consumable';
  use:
    | { type: 'heal'; amount: { n: number; d: number; plus: number }; curesBleed?: boolean }
    | { type: 'cure'; statuses: StatusKind[] }
    | { type: 'bomb'; aoe: { size: number; igniteTurns: number; fireDmg: number }; dmg: { n: number; d: number; plus: number }; range: number };
}

export interface AmmoDef extends ItemBase {
  kind: 'ammo';
}

export interface QuestItemDef extends ItemBase {
  kind: 'quest';
}

export type ItemDef = WeaponDef | ArmorDef | AmuletDef | ConsumableDef | AmmoDef | QuestItemDef;

export interface ItemStack {
  id: string;
  count: number;
}

// ---------- Юниты ----------

export interface UnitTemplate {
  defId: string;
  nameKey: string;
  bioKey?: string;
  side: Side;
  stats: Stats;
  baseHp: number;
  model: string; // ключ модели персонажа
  palette: string; // ключ перекраски
  weaponId: string;
  spareWeaponId?: string;
  armorId?: string;
  amuletId?: string;
  quick?: ItemStack[];
  xpValue?: number; // опыт за убийство (враги)
  aiRole?: 'brute' | 'flanker' | 'alchemist' | 'leader' | 'shooter';
  scale?: number;
}

export interface Injury {
  stat: StatName;
  amount: number;
}

export interface UnitState {
  id: string;
  defId: string;
  side: Side;
  nameKey: string;
  stats: Stats;
  hp: number;
  maxHp: number;
  ap: number;
  pos: Vec2;
  weaponId: string;
  spareWeaponId: string | null;
  armorId: string | null;
  amuletId: string | null;
  quick: (ItemStack | null)[];
  loaded: number; // заряжено в текущем дальнобойном
  spareLoaded: number;
  statuses: StatusInst[];
  down: boolean; // без сознания / мёртв
  looted: boolean;
  // RPG
  xp: number;
  level: number;
  perks: string[];
  injuries: Injury[];
  unspentStat: number;
  perkChoice: string[] | null; // предложенные перки при левел-апе
  // бой: бухгалтерия за ход
  passBank: number;
  maraudUsed: boolean;
  amuletUsed: boolean;
  marks: string[]; // Кровник: помеченные враги
  panicked: boolean; // пропуск хода (мораль)
  aiRole?: UnitTemplate['aiRole'];
  xpValue: number;
}

// ---------- Карта ----------

export type CellKind = 'void' | 'floor' | 'wall' | 'door' | 'cover_half' | 'cover_full';

export interface PropSpawn {
  model: string;
  x: number;
  y: number;
  rot?: number; // четверти
  s?: number;
}

export interface LightSpawn {
  x: number;
  y: number;
  h?: number;
  color?: number;
  intensity?: number;
}

export interface LootSpawn {
  x: number;
  y: number;
  items: ItemStack[];
  nameKey: string;
}

export interface MapDef {
  id: string;
  nameKey: string;
  /** ascii-строки; легенда в grid.ts */
  rows: string[];
  props?: PropSpawn[];
  lights?: LightSpawn[];
  loot?: LootSpawn[];
  playerSpawns: Vec2[];
  /** точки появления групп врагов: ключ группы -> клетки */
  enemySpawns?: Record<string, Vec2[]>;
  /** интерактивные триггеры (М3): вход в диалог, переходы */
  triggers?: { x: number; y: number; w: number; h: number; event: string }[];
  ambient?: 'village' | 'chapel';
}

// ---------- Бой ----------

export type BattleResult = 'victory' | 'defeat' | null;

export interface FireCell {
  x: number;
  y: number;
  turns: number;
}

export interface BattleState {
  mapId: string;
  rngState: number;
  units: UnitState[];
  order: string[];
  turnIdx: number;
  round: number;
  fire: FireCell[];
  openDoors: string[]; // "x,y"
  result: BattleResult;
  /** опыт, начисленный за бой (на экран итогов) */
  xpAwarded: number;
  leaderDead: boolean;
}

export type AttackMode = 'light' | 'heavy';

export interface HitPreview {
  chance: number;
  critChance: number;
  dmgMin: number;
  dmgMax: number;
  parts: { key: string; val: number }[]; // разбивка для тултипа
  blocked?: boolean; // нет LOS
  flanked: boolean;
  cover: 'none' | 'half' | 'full';
}

// события боя — рендер проигрывает их очередью
export type BattleEvent =
  | { type: 'move'; unit: string; path: Vec2[] }
  | { type: 'face'; unit: string; to: Vec2 }
  | {
      type: 'attack';
      unit: string;
      target: string;
      weapon: string;
      mode: AttackMode;
      hit: boolean;
      crit: boolean;
      dmg: number;
      killed: boolean;
      downed: boolean;
    }
  | { type: 'throw'; unit: string; item: string; at: Vec2 }
  | { type: 'aoeFire'; cells: Vec2[]; turns: number }
  | { type: 'fireOut'; cells: Vec2[] }
  | { type: 'damage'; unit: string; amount: number; source: 'fire' | 'bleed' | 'thorns'; killed: boolean; downed: boolean }
  | { type: 'heal'; unit: string; by: string; amount: number }
  | { type: 'status'; unit: string; status: StatusKind; on: boolean }
  | { type: 'reload'; unit: string }
  | { type: 'door'; at: Vec2; open: boolean }
  | { type: 'pass'; unit: string; banked: number }
  | { type: 'swap'; unit: string; weapon: string }
  | { type: 'transfer'; from: string; to: string; item: string }
  | { type: 'useItem'; unit: string; item: string; target?: string }
  | { type: 'turnStart'; unit: string; round: number }
  | { type: 'panic'; unit: string }
  | { type: 'secondWind'; unit: string }
  | { type: 'battleEnd'; result: 'victory' | 'defeat' }
  | { type: 'xp'; amount: number };

export type BattleAction =
  | { type: 'move'; to: Vec2 }
  | { type: 'attack'; target: string; mode: AttackMode }
  | { type: 'attackArea'; at: Vec2 }
  | { type: 'surge' }
  | { type: 'reload' }
  | { type: 'useQuick'; slot: number; target?: string; at?: Vec2 }
  | { type: 'openDoor'; at: Vec2 }
  | { type: 'swapWeapon' }
  | { type: 'transfer'; to: string; item: string }
  | { type: 'pass' };
