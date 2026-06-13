import { itemDef } from '../data/items';
import type { ArmorDef, StatName, Stats, UnitState, UnitTemplate, WeaponDef } from './types';

/** эффективное значение стата с учётом травм */
export function effStat(u: UnitState, s: StatName): number {
  let v = u.stats[s];
  for (const inj of u.injuries) if (inj.stat === s) v -= inj.amount;
  return Math.max(1, v);
}

export function weaponOf(u: UnitState): WeaponDef {
  return itemDef(u.weaponId) as WeaponDef;
}

export function armorOf(u: UnitState): ArmorDef | null {
  return u.armorId ? (itemDef(u.armorId) as ArmorDef) : null;
}

export function armorValue(u: UnitState): number {
  return armorOf(u)?.armor ?? 0;
}

/** максимум ОД: база 8, модифицируется Ловкостью и бронёй */
export function maxAp(u: UnitState): number {
  const dex = effStat(u, 'dex');
  const pen = armorOf(u)?.apPenalty ?? 0;
  return Math.max(2, 8 + Math.floor((dex - 5) / 2) - pen);
}

export function maxHpOf(baseHp: number, level: number): number {
  return baseHp + (level - 1) * 3;
}

/** шанс крита, % */
export function critChance(u: UnitState): number {
  return 5 + (effStat(u, 'int') - 5) * 2;
}

/** уклонение цели (вычитается из шанса попадания) */
export function dodgeOf(u: UnitState): number {
  return (effStat(u, 'dex') - 5) * 3;
}

export function hasPerk(u: UnitState, perk: string): boolean {
  return u.perks.includes(perk);
}

export function hasStatus(u: UnitState, kind: string): boolean {
  return u.statuses.some((s) => s.kind === kind);
}

/** пороги уровней (суммарный опыт) */
export const XP_LEVELS = [0, 150, 400, 750, 1200];

export function levelForXp(xp: number): number {
  let lvl = 1;
  for (let i = 1; i < XP_LEVELS.length; i++) if (xp >= XP_LEVELS[i]) lvl = i + 1;
  return lvl;
}

let unitSeq = 0;

export function makeUnit(tpl: UnitTemplate, id?: string): UnitState {
  const wpn = itemDef(tpl.weaponId) as WeaponDef;
  const u: UnitState = {
    id: id ?? tpl.defId + '_' + unitSeq++,
    defId: tpl.defId,
    side: tpl.side,
    nameKey: tpl.nameKey,
    stats: { ...tpl.stats },
    hp: tpl.baseHp,
    maxHp: tpl.baseHp,
    ap: 0,
    pos: { x: 0, y: 0 },
    weaponId: tpl.weaponId,
    spareWeaponId: tpl.spareWeaponId ?? null,
    armorId: tpl.armorId ?? null,
    amuletId: tpl.amuletId ?? null,
    quick: [null, null, null, null],
    loaded: wpn.clip ?? 0,
    spareLoaded: tpl.spareWeaponId ? ((itemDef(tpl.spareWeaponId) as WeaponDef).clip ?? 0) : 0,
    statuses: [],
    down: false,
    looted: false,
    xp: 0,
    level: 1,
    perks: [],
    injuries: [],
    unspentStat: 0,
    perkChoice: null,
    passBank: 0,
    maraudUsed: false,
    amuletUsed: false,
    marks: [],
    panicked: false,
    aiRole: tpl.aiRole,
    xpValue: tpl.xpValue ?? 0,
  };
  (tpl.quick ?? []).forEach((s, i) => {
    if (i < 4) u.quick[i] = { ...s };
  });
  return u;
}

export function resetUnitSeq(): void {
  unitSeq = 0;
}
