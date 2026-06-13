import type { Dialogue } from '../game/dialogue';

/**
 * Сюжетные диалоги пролога. Текст — в strings.ts (ключи dlg.*).
 * Сцены переключает контроллер кампании по эффектам goto.
 */
export const DIALOGUES: Record<string, Dialogue> = {
  // Вход в Чернолесье
  intro: {
    id: 'intro',
    start: 'n1',
    nodes: {
      n1: {
        id: 'n1',
        speaker: 'narrator',
        textKey: 'dlg.intro.1',
        options: [{ textKey: 'dlg.intro.opt.go', next: 'n2' }],
      },
      n2: {
        id: 'n2',
        speaker: 'narrator',
        textKey: 'dlg.intro.2',
        options: [{ textKey: 'dlg.intro.opt.go', next: 'n3' }],
      },
      n3: {
        id: 'n3',
        speaker: 'narrator',
        textKey: 'dlg.intro.3',
        options: [
          {
            textKey: 'dlg.intro.opt.fight',
            effects: [{ type: 'goto', scene: 'battle1' }],
            next: null,
          },
        ],
      },
    },
  },

  // Староста-трус
  elder: {
    id: 'elder',
    start: 'n1',
    nodes: {
      n1: {
        id: 'n1',
        speaker: 'npc_elder',
        speakerNameKey: 'npc.elder',
        textKey: 'dlg.elder.1',
        options: [
          { textKey: 'dlg.elder.opt.what', next: 'n2' },
          {
            textKey: 'dlg.elder.opt.press',
            check: { stat: 'wil', value: 6 },
            effects: [{ type: 'flag', key: 'elder_truth' }, { type: 'xp', amount: 40 }],
            next: 'n3',
          },
          {
            textKey: 'dlg.elder.opt.letter',
            show: [{ type: 'hasItem', id: 'abbot_letter' }, { type: 'noflag', key: 'elder_letter' }],
            effects: [
              { type: 'flag', key: 'elder_letter' },
              { type: 'flag', key: 'elder_truth' },
              { type: 'xp', amount: 40 },
            ],
            next: 'n4',
          },
          { textKey: 'dlg.elder.opt.leave', next: null },
        ],
      },
      n2: {
        id: 'n2',
        speaker: 'npc_elder',
        speakerNameKey: 'npc.elder',
        textKey: 'dlg.elder.2',
        options: [
          {
            textKey: 'dlg.elder.2.opt.press',
            check: { stat: 'wil', value: 6 },
            effects: [{ type: 'flag', key: 'elder_truth' }, { type: 'xp', amount: 40 }],
            next: 'n3',
          },
          { textKey: 'dlg.elder.2.opt.leave', next: null },
        ],
      },
      n3: {
        id: 'n3',
        speaker: 'npc_elder',
        speakerNameKey: 'npc.elder',
        textKey: 'dlg.elder.3',
        options: [{ textKey: 'dlg.elder.opt.end', next: null }],
      },
      n4: {
        id: 'n4',
        speaker: 'npc_elder',
        speakerNameKey: 'npc.elder',
        textKey: 'dlg.elder.4',
        options: [{ textKey: 'dlg.elder.opt.end', next: null }],
      },
    },
  },

  // Травница
  herbalist: {
    id: 'herbalist',
    start: 'n1',
    nodes: {
      n1: {
        id: 'n1',
        speaker: 'npc_herbalist',
        speakerNameKey: 'npc.herbalist',
        textKey: 'dlg.herb.1',
        options: [
          { textKey: 'dlg.herb.opt.what', next: 'n2' },
          {
            textKey: 'dlg.herb.opt.mind',
            check: { stat: 'int', value: 6 },
            effects: [{ type: 'flag', key: 'herb_hint' }, { type: 'xp', amount: 40 }],
            next: 'n3',
          },
          { textKey: 'dlg.herb.opt.leave', next: null },
        ],
      },
      n2: {
        id: 'n2',
        speaker: 'npc_herbalist',
        speakerNameKey: 'npc.herbalist',
        textKey: 'dlg.herb.2',
        options: [
          {
            textKey: 'dlg.herb.opt.mind',
            check: { stat: 'int', value: 6 },
            effects: [{ type: 'flag', key: 'herb_hint' }, { type: 'xp', amount: 40 }],
            next: 'n3',
          },
          {
            textKey: 'dlg.herb.opt.end',
            effects: [{ type: 'giveItem', id: 'bandage', count: 2 }],
            next: null,
          },
        ],
      },
      n3: {
        id: 'n3',
        speaker: 'narrator',
        textKey: 'dlg.herb.3',
        options: [
          {
            textKey: 'dlg.herb.opt.end',
            effects: [{ type: 'giveItem', id: 'bandage', count: 2 }],
            next: null,
          },
        ],
      },
    },
  },

  // Мальчишка-свидетель
  boy: {
    id: 'boy',
    start: 'n1',
    nodes: {
      n1: {
        id: 'n1',
        speaker: 'npc_boy',
        speakerNameKey: 'npc.boy',
        textKey: 'dlg.boy.1',
        options: [
          {
            textKey: 'dlg.boy.opt.tell',
            effects: [{ type: 'flag', key: 'boy_witness' }, { type: 'xp', amount: 30 }],
            next: 'n2',
          },
          { textKey: 'dlg.boy.opt.leave', next: null },
        ],
      },
      n2: {
        id: 'n2',
        speaker: 'npc_boy',
        speakerNameKey: 'npc.boy',
        textKey: 'dlg.boy.2',
        options: [{ textKey: 'dlg.intro.opt.go', next: 'n3' }],
      },
      n3: {
        id: 'n3',
        speaker: 'npc_boy',
        speakerNameKey: 'npc.boy',
        textKey: 'dlg.boy.3',
        options: [{ textKey: 'dlg.boy.opt.end', next: null }],
      },
    },
  },

  // Настоятель у дверей часовни — Бой 2 можно избежать или ослабить
  abbot: {
    id: 'abbot',
    start: 'n1',
    nodes: {
      n1: {
        id: 'n1',
        speaker: 'abbot',
        speakerNameKey: 'unit.abbot',
        textKey: 'dlg.abbot.1',
        options: [
          {
            textKey: 'dlg.abbot.opt.letter',
            show: [{ type: 'hasItem', id: 'abbot_letter' }],
            effects: [
              { type: 'flag', key: 'battle2_avoided' },
              { type: 'xp', amount: 200 },
              { type: 'takeItem', id: 'abbot_letter' },
            ],
            next: 'n_letter',
          },
          {
            textKey: 'dlg.abbot.opt.will',
            check: { stat: 'wil', value: 7 },
            effects: [{ type: 'flag', key: 'battle2_weak' }, { type: 'xp', amount: 80 }],
            next: 'n_will',
          },
          {
            textKey: 'dlg.abbot.opt.mind',
            check: { stat: 'int', value: 7 },
            effects: [{ type: 'flag', key: 'battle2_weak' }, { type: 'xp', amount: 80 }],
            next: 'n_mind',
          },
          {
            textKey: 'dlg.abbot.opt.fight',
            effects: [{ type: 'goto', scene: 'battle2' }],
            next: null,
          },
        ],
      },
      n_will: {
        id: 'n_will',
        speaker: 'narrator',
        textKey: 'dlg.abbot.2.will',
        options: [
          {
            textKey: 'dlg.abbot.2.will.opt',
            effects: [{ type: 'goto', scene: 'battle2' }],
            next: null,
          },
        ],
      },
      n_mind: {
        id: 'n_mind',
        speaker: 'narrator',
        textKey: 'dlg.abbot.2.mind',
        options: [
          {
            textKey: 'dlg.abbot.2.mind.opt',
            effects: [{ type: 'goto', scene: 'battle2' }],
            next: null,
          },
        ],
      },
      n_letter: {
        id: 'n_letter',
        speaker: 'abbot',
        speakerNameKey: 'unit.abbot',
        textKey: 'dlg.abbot.2.letter',
        options: [
          {
            textKey: 'dlg.abbot.2.letter.opt',
            effects: [{ type: 'goto', scene: 'relic' }],
            next: null,
          },
        ],
      },
    },
  },

  // Реликвия — финальный выбор
  relic: {
    id: 'relic',
    start: 'n1',
    nodes: {
      n1: {
        id: 'n1',
        speaker: 'narrator',
        textKey: 'dlg.relic.1',
        options: [{ textKey: 'dlg.intro.opt.go', next: 'n2' }],
      },
      n2: {
        id: 'n2',
        speaker: 'narrator',
        textKey: 'dlg.relic.2',
        options: [
          {
            textKey: 'dlg.relic.opt.order',
            effects: [{ type: 'flag', key: 'final', value: 'order' }, { type: 'goto', scene: 'epilogue_order' }],
            next: null,
          },
          {
            textKey: 'dlg.relic.opt.destroy',
            effects: [{ type: 'flag', key: 'final', value: 'destroy' }],
            next: 'n_destroy',
          },
          {
            textKey: 'dlg.relic.opt.keep',
            effects: [
              { type: 'flag', key: 'final', value: 'keep' },
              { type: 'giveItem', id: 'relic' },
              { type: 'goto', scene: 'epilogue_keep' },
            ],
            next: null,
          },
        ],
      },
      n_destroy: {
        id: 'n_destroy',
        speaker: 'narrator',
        textKey: 'dlg.relic.destroy.1',
        options: [
          {
            textKey: 'dlg.relic.destroy.opt',
            effects: [{ type: 'goto', scene: 'battle_final' }],
            next: null,
          },
        ],
      },
    },
  },
};
