import { describe, expect, it } from 'vitest';
import { DIALOGUES } from '../src/data/dialogues';
import { RU } from '../src/data/strings';
import { newCampaign, addToBackpack } from '../src/game/campaign';
import { bestStat, checkCondition, optionEnabled, optionVisible } from '../src/game/dialogue';

describe('Диалоги', () => {
  it('все узлы ссылаются на существующие узлы и ключи строк', () => {
    for (const dlg of Object.values(DIALOGUES)) {
      expect(dlg.nodes[dlg.start], dlg.id + ': start').toBeDefined();
      for (const node of Object.values(dlg.nodes)) {
        expect(RU[node.textKey], dlg.id + '/' + node.id + ': text ' + node.textKey).toBeDefined();
        for (const o of node.options) {
          expect(RU[o.textKey], dlg.id + '/' + node.id + ': opt ' + o.textKey).toBeDefined();
          if (o.next) expect(dlg.nodes[o.next], dlg.id + '/' + node.id + ' -> ' + o.next).toBeDefined();
        }
      }
    }
  });

  it('у каждого узла есть хотя бы одна безусловная доступная опция', () => {
    const c = newCampaign('dlg-test');
    for (const dlg of Object.values(DIALOGUES)) {
      for (const node of Object.values(dlg.nodes)) {
        const open = node.options.filter((o) => !o.check && (o.show ?? []).length === 0);
        expect(open.length, dlg.id + '/' + node.id + ': нет выхода без условий').toBeGreaterThan(0);
      }
    }
  });

  it('чеки статов берут лучший стат отряда', () => {
    const c = newCampaign('dlg-test');
    expect(bestStat(c, 'wil')).toBe(8); // Расстрига
    expect(bestStat(c, 'int')).toBe(8); // Книжница
    const opt = { textKey: 'x', check: { stat: 'wil' as const, value: 7 }, next: null };
    expect(optionEnabled(c, opt)).toBe(true);
    const hard = { textKey: 'x', check: { stat: 'str' as const, value: 10 }, next: null };
    expect(optionEnabled(c, hard)).toBe(false);
  });

  it('условия по флагам и предметам', () => {
    const c = newCampaign('dlg-test');
    expect(checkCondition(c, { type: 'hasItem', id: 'abbot_letter' })).toBe(false);
    addToBackpack(c, { id: 'abbot_letter', count: 1 });
    expect(checkCondition(c, { type: 'hasItem', id: 'abbot_letter' })).toBe(true);
    expect(checkCondition(c, { type: 'noflag', key: 'x' })).toBe(true);
    c.flags.x = true;
    expect(checkCondition(c, { type: 'flag', key: 'x' })).toBe(true);
  });

  it('развилка настоятеля: письмо открывает мирный путь', () => {
    const c = newCampaign('dlg-test');
    const node = DIALOGUES.abbot.nodes.n1;
    const letterOpt = node.options.find((o) => o.textKey === 'dlg.abbot.opt.letter')!;
    expect(optionVisible(c, letterOpt)).toBe(false);
    addToBackpack(c, { id: 'abbot_letter', count: 1 });
    expect(optionVisible(c, letterOpt)).toBe(true);
    const effects = letterOpt.effects!;
    expect(effects.some((e) => e.type === 'flag' && e.key === 'battle2_avoided')).toBe(true);
  });

  it('финал: три исхода ведут к трём эпилогам', () => {
    const node = DIALOGUES.relic.nodes.n2;
    const scenes = new Set<string>();
    for (const o of node.options) {
      for (const e of o.effects ?? []) {
        if (e.type === 'goto') scenes.add(e.scene);
        if (e.type === 'flag' && e.key === 'final') scenes.add('final:' + String(e.value));
      }
      if (o.next === 'n_destroy') scenes.add('goto:destroy_battle');
    }
    expect(scenes.has('epilogue_order')).toBe(true);
    expect(scenes.has('epilogue_keep')).toBe(true);
    expect(scenes.has('goto:destroy_battle')).toBe(true);
    // у destroy-узла — бой с вознёсшимся
    const d = DIALOGUES.relic.nodes.n_destroy.options[0].effects!;
    expect(d.some((e) => e.type === 'goto' && e.scene === 'battle_final')).toBe(true);
  });
});
