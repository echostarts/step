import type { CampaignState } from './campaign';
import { hasItem } from './campaign';
import type { StatName } from './types';

/**
 * Data-driven диалоги: узлы с текстом, опциями, условиями по флагам,
 * чеками статов и последствиями. Текст — только ключи словаря.
 */

export type DlgCondition =
  | { type: 'flag'; key: string; value?: boolean | number | string }
  | { type: 'noflag'; key: string }
  | { type: 'hasItem'; id: string }
  | { type: 'noItem'; id: string };

export type DlgEffect =
  | { type: 'flag'; key: string; value?: boolean | number | string }
  | { type: 'giveItem'; id: string; count?: number }
  | { type: 'takeItem'; id: string; count?: number }
  | { type: 'xp'; amount: number }
  /** смена сцены — интерпретирует контроллер кампании */
  | { type: 'goto'; scene: string };

export interface DlgOption {
  textKey: string;
  /** чек стата: берётся лучший в отряде; не хватает — опция видна, но заперта */
  check?: { stat: StatName; value: number };
  /** показывать только при выполнении всех условий */
  show?: DlgCondition[];
  effects?: DlgEffect[];
  next: string | null;
}

export interface DlgNode {
  id: string;
  /** defId говорящего для портрета; 'narrator' — без портрета */
  speaker: string;
  speakerNameKey?: string;
  textKey: string;
  options: DlgOption[];
}

export interface Dialogue {
  id: string;
  start: string;
  nodes: Record<string, DlgNode>;
}

export function checkCondition(c: CampaignState, cond: DlgCondition): boolean {
  switch (cond.type) {
    case 'flag': {
      const v = c.flags[cond.key];
      return cond.value === undefined ? !!v : v === cond.value;
    }
    case 'noflag':
      return !c.flags[cond.key];
    case 'hasItem':
      return hasItem(c, cond.id);
    case 'noItem':
      return !hasItem(c, cond.id);
  }
}

/** лучший стат в отряде (отряд говорит устами умнейшего) */
export function bestStat(c: CampaignState, stat: StatName): number {
  let best = 0;
  for (const u of c.squad) {
    let v = u.stats[stat];
    for (const inj of u.injuries) if (inj.stat === stat) v -= inj.amount;
    if (v > best) best = v;
  }
  return best;
}

export function optionVisible(c: CampaignState, o: DlgOption): boolean {
  return (o.show ?? []).every((cond) => checkCondition(c, cond));
}

export function optionEnabled(c: CampaignState, o: DlgOption): boolean {
  if (!o.check) return true;
  return bestStat(c, o.check.stat) >= o.check.value;
}
