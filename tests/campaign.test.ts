import { beforeEach, describe, expect, it } from 'vitest';
import {
  addToBackpack,
  applyLevelUp,
  awardXp,
  backpackWeight,
  exportSave,
  importSave,
  newCampaign,
  removeFromBackpack,
  restSquad,
  rollPerkChoice,
  weightLimit,
} from '../src/game/campaign';
import { resetUnitSeq, XP_LEVELS } from '../src/game/unit';

beforeEach(() => resetUnitSeq());

describe('Кампания', () => {
  it('новая кампания: четверо отречённых, стартовый рюкзак', () => {
    const c = newCampaign('test');
    expect(c.squad.map((u) => u.defId)).toEqual(['vdova', 'rasstriga', 'kolodnik', 'knizhnitsa']);
    expect(c.backpack.length).toBeGreaterThan(0);
  });

  it('опыт поднимает уровень, даёт стат и выбор из трёх перков', () => {
    const c = newCampaign('test');
    const ups = awardXp(c, XP_LEVELS[1]);
    expect(ups.length).toBe(4);
    const u = c.squad[0];
    expect(u.level).toBe(2);
    expect(u.unspentStat).toBe(1);
    expect(u.perkChoice).toHaveLength(3);
    expect(new Set(u.perkChoice).size).toBe(3);
  });

  it('выбор перков детерминирован сидом', () => {
    const a = newCampaign('seed1');
    const b = newCampaign('seed1');
    const cDiff = newCampaign('seed2');
    expect(rollPerkChoice(a, a.squad[0])).toEqual(rollPerkChoice(b, b.squad[0]));
    // другой сид почти наверняка даёт другой набор (фиксируем текущее поведение)
    expect(rollPerkChoice(a, a.squad[0])).not.toEqual(rollPerkChoice(cDiff, cDiff.squad[0]));
  });

  it('applyLevelUp: +1 стат и перк из предложенных', () => {
    const c = newCampaign('test');
    awardXp(c, XP_LEVELS[1]);
    const u = c.squad[0];
    const dex0 = u.stats.dex;
    const perk = u.perkChoice![0];
    applyLevelUp(u, 'dex', perk);
    expect(u.stats.dex).toBe(dex0 + 1);
    expect(u.perks).toContain(perk);
    expect(u.perkChoice).toBeNull();
    expect(u.unspentStat).toBe(0);
  });

  it('рюкзак: стакуемое складывается, вес считается, лимит от Силы', () => {
    const c = newCampaign('test');
    c.backpack = [];
    addToBackpack(c, { id: 'bolts', count: 5 });
    addToBackpack(c, { id: 'bolts', count: 3 });
    expect(c.backpack).toHaveLength(1);
    expect(c.backpack[0].count).toBe(8);
    addToBackpack(c, { id: 'sword', count: 1 });
    expect(backpackWeight(c)).toBeCloseTo(8 * 0.1 + 3, 5);
    expect(weightLimit(c)).toBe(c.squad.reduce((s, u) => s + u.stats.str, 0) * 2.5);
    expect(removeFromBackpack(c, 'bolts', 8)).toBe(true);
    expect(removeFromBackpack(c, 'bolts', 1)).toBe(false);
  });

  it('экспорт/импорт сейва сохраняет состояние (юникод включительно)', () => {
    const c = newCampaign('тест-сид');
    awardXp(c, 200);
    c.flags.got_letter = true;
    const s = exportSave(c);
    const back = importSave(s);
    expect(back).not.toBeNull();
    expect(back!.seedStr).toBe('тест-сид');
    expect(back!.flags.got_letter).toBe(true);
    expect(back!.squad[0].xp).toBe(200);
  });

  it('importSave мусора возвращает null', () => {
    expect(importSave('не сейв')).toBeNull();
    expect(importSave(btoa('{"a":1}'))).toBeNull();
  });

  it('restSquad: лечит, чистит статусы, перезаряжает', () => {
    const c = newCampaign('test');
    const u = c.squad[0]; // вдова с арбалетом
    u.hp = 3;
    u.down = true;
    u.loaded = 0;
    u.statuses.push({ kind: 'bleed', turns: 2 });
    restSquad(c);
    expect(u.hp).toBe(u.maxHp);
    expect(u.down).toBe(false);
    expect(u.statuses).toHaveLength(0);
    expect(u.loaded).toBe(1);
  });
});
