import { hashSeed, Rng } from '../core/rng';
import { itemDef } from '../data/items';
import { PERK_IDS } from '../data/perks';
import { SQUAD } from '../data/units';
import type { BattleState, ItemStack, StatName, UnitState } from './types';
import { levelForXp, makeUnit, maxHpOf } from './unit';

/**
 * Состояние кампании: отряд живёт между боями, рюкзак общий,
 * флаги двигают сюжет. Полностью сериализуемо.
 */
export interface CampaignState {
  version: number;
  seedStr: string;
  /** счётчик для производных сидов (каждый бой свой) */
  battleCounter: number;
  squad: UnitState[];
  backpack: ItemStack[];
  flags: Record<string, boolean | number | string>;
  /** текущая сцена сюжета */
  scene: string;
  /** активный бой (если сохранились посреди боя) */
  battle: BattleState | null;
  battleFlags: string[];
  fogExplored: string[];
}

export const SAVE_KEY = 'otr_save_v1';

export function newCampaign(seedStr: string): CampaignState {
  const squad = SQUAD.map((tpl) => makeUnit(tpl, 'pc_' + tpl.defId));
  return {
    version: 1,
    seedStr,
    battleCounter: 0,
    squad,
    backpack: [
      { id: 'bandage', count: 2 },
      { id: 'bolts', count: 6 },
    ],
    flags: {},
    scene: 'intro',
    battle: null,
    battleFlags: [],
    fogExplored: [],
  };
}

export function campaignRng(c: CampaignState, salt: string): Rng {
  return new Rng(hashSeed(c.seedStr + ':' + salt));
}

// ---------- Сейв/лоад ----------

export function saveCampaign(c: CampaignState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(c));
  } catch (e) {
    console.warn('save failed', e);
  }
}

export function loadCampaign(): CampaignState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as CampaignState;
    if (c.version !== 1) return null;
    return c;
  } catch {
    return null;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ничего */
  }
}

/** экспорт сейва строкой (base64 от JSON, юникод-безопасно) */
export function exportSave(c: CampaignState): string {
  const json = JSON.stringify(c);
  return btoa(String.fromCharCode(...new TextEncoder().encode(json)));
}

export function importSave(s: string): CampaignState | null {
  try {
    const bytes = Uint8Array.from(atob(s.trim()), (ch) => ch.charCodeAt(0));
    const c = JSON.parse(new TextDecoder().decode(bytes)) as CampaignState;
    if (c.version !== 1 || !Array.isArray(c.squad)) return null;
    return c;
  } catch {
    return null;
  }
}

// ---------- Опыт и уровни ----------

/** начислить опыт каждому бойцу; вернуть тех, кто поднял уровень */
export function awardXp(c: CampaignState, amount: number): UnitState[] {
  const ups: UnitState[] = [];
  for (const u of c.squad) {
    u.xp += amount;
    const newLevel = levelForXp(u.xp);
    while (u.level < newLevel) {
      u.level++;
      u.unspentStat++;
      u.maxHp = maxHpOf(squadTemplate(u.defId).baseHp, u.level);
      if (!u.perkChoice) u.perkChoice = rollPerkChoice(c, u);
      if (!ups.includes(u)) ups.push(u);
    }
  }
  return ups;
}

function squadTemplate(defId: string) {
  const tpl = SQUAD.find((s) => s.defId === defId);
  if (!tpl) throw new Error('not a squad member: ' + defId);
  return tpl;
}

/** три случайных перка из пула (детерминированно от сида и опыта) */
export function rollPerkChoice(c: CampaignState, u: UnitState): string[] {
  const pool = PERK_IDS.filter((p) => !u.perks.includes(p));
  const rng = campaignRng(c, 'perk:' + u.id + ':' + u.level);
  const out: string[] = [];
  while (out.length < 3 && pool.length) {
    const i = rng.int(0, pool.length - 1);
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}

export function applyLevelUp(u: UnitState, stat: StatName, perk: string): void {
  if (u.unspentStat > 0) {
    u.stats[stat] = Math.min(10, u.stats[stat] + 1);
    u.unspentStat--;
  }
  if (perk && u.perkChoice?.includes(perk) && !u.perks.includes(perk)) {
    u.perks.push(perk);
  }
  u.perkChoice = null;
}

// ---------- Инвентарь ----------

/** лимит веса рюкзака: от суммарной Силы отряда */
export function weightLimit(c: CampaignState): number {
  const totalStr = c.squad.reduce((s, u) => s + u.stats.str, 0);
  return totalStr * 2.5;
}

export function backpackWeight(c: CampaignState): number {
  let w = 0;
  for (const s of c.backpack) w += itemDef(s.id).weight * s.count;
  return Math.round(w * 10) / 10;
}

export function addToBackpack(c: CampaignState, stack: ItemStack): void {
  const def = itemDef(stack.id);
  if (def.stack) {
    const exist = c.backpack.find((s) => s.id === stack.id);
    if (exist) exist.count += stack.count;
    else c.backpack.push({ ...stack });
  } else {
    for (let i = 0; i < stack.count; i++) c.backpack.push({ id: stack.id, count: 1 });
  }
}

export function removeFromBackpack(c: CampaignState, id: string, count = 1): boolean {
  const i = c.backpack.findIndex((s) => s.id === id);
  if (i < 0) return false;
  const s = c.backpack[i];
  if (s.count < count) return false;
  s.count -= count;
  if (s.count <= 0) c.backpack.splice(i, 1);
  return true;
}

export function hasItem(c: CampaignState, id: string): boolean {
  return (
    c.backpack.some((s) => s.id === id) ||
    c.squad.some(
      (u) =>
        u.weaponId === id ||
        u.spareWeaponId === id ||
        u.armorId === id ||
        u.amuletId === id ||
        u.quick.some((q) => q?.id === id),
    )
  );
}

/** подготовить отряд к новой сцене: подлечить, снять статусы, перезарядиться */
export function restSquad(c: CampaignState): void {
  for (const u of c.squad) {
    u.hp = u.maxHp;
    u.down = false;
    u.statuses = [];
    u.passBank = 0;
    u.maraudUsed = false;
    u.amuletUsed = false;
    u.marks = [];
    u.panicked = false;
    u.looted = false;
    const w = itemDef(u.weaponId);
    u.loaded = w.kind === 'weapon' ? (w.clip ?? 0) : 0;
    if (u.spareWeaponId) {
      const sw = itemDef(u.spareWeaponId);
      u.spareLoaded = sw.kind === 'weapon' ? (sw.clip ?? 0) : 0;
    }
  }
}
