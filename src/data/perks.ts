/**
 * Перки. Железное правило: ни одного плоского процентного бонуса —
 * каждый перк меняет глагол действия, добавляет триггер или выбор с ценой.
 * Логика перков встроена в движок боя по id.
 */
export interface PerkDef {
  id: string;
  nameKey: string;
  descKey: string;
  icon: string;
}

export const PERKS: Record<string, PerkDef> = {
  cold_blood: {
    id: 'cold_blood',
    nameKey: 'perk.cold_blood',
    descKey: 'perk.cold_blood.desc',
    icon: 'cold-heart',
  },
  marauder: {
    id: 'marauder',
    nameKey: 'perk.marauder',
    descKey: 'perk.marauder.desc',
    icon: 'backstab',
  },
  shield_wall: {
    id: 'shield_wall',
    nameKey: 'perk.shield_wall',
    descKey: 'perk.shield_wall.desc',
    icon: 'shield-bash',
  },
  blood_feud: {
    id: 'blood_feud',
    nameKey: 'perk.blood_feud',
    descKey: 'perk.blood_feud.desc',
    icon: 'targeting',
  },
  apothecary: {
    id: 'apothecary',
    nameKey: 'perk.apothecary',
    descKey: 'perk.apothecary.desc',
    icon: 'apothecary',
  },
  surge: {
    id: 'surge',
    nameKey: 'perk.surge',
    descKey: 'perk.surge.desc',
    icon: 'sprint',
  },
  jagged_edge: {
    id: 'jagged_edge',
    nameKey: 'perk.jagged_edge',
    descKey: 'perk.jagged_edge.desc',
    icon: 'deadly-strike',
  },
  pierce_shot: {
    id: 'pierce_shot',
    nameKey: 'perk.pierce_shot',
    descKey: 'perk.pierce_shot.desc',
    icon: 'pierced-body',
  },
  riposte: {
    id: 'riposte',
    nameKey: 'perk.riposte',
    descKey: 'perk.riposte.desc',
    icon: 'sword-clash',
  },
  acrid_fumes: {
    id: 'acrid_fumes',
    nameKey: 'perk.acrid_fumes',
    descKey: 'perk.acrid_fumes.desc',
    icon: 'fire-dash',
  },
  swagger: {
    id: 'swagger',
    nameKey: 'perk.swagger',
    descKey: 'perk.swagger.desc',
    icon: 'bullseye',
  },
  unbroken: {
    id: 'unbroken',
    nameKey: 'perk.unbroken',
    descKey: 'perk.unbroken.desc',
    icon: 'half-heart',
  },
};

export const PERK_IDS = Object.keys(PERKS);
