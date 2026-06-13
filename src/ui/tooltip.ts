import { t } from '../core/i18n';
import { itemDef } from '../data/items';
import type { AmuletDef, ArmorDef, ConsumableDef, ItemDef, WeaponDef } from '../game/types';

/** Единый тултип: следует за курсором, наполняется html. */
let tipEl: HTMLDivElement | null = null;

function ensure(): HTMLDivElement {
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.className = 'tooltip hidden';
    document.body.appendChild(tipEl);
    window.addEventListener('pointermove', (e) => {
      if (!tipEl || tipEl.classList.contains('hidden')) return;
      const x = Math.min(e.clientX + 16, window.innerWidth - tipEl.offsetWidth - 8);
      const y = Math.min(e.clientY + 14, window.innerHeight - tipEl.offsetHeight - 8);
      tipEl.style.left = x + 'px';
      tipEl.style.top = y + 'px';
    });
  }
  return tipEl;
}

export function bindTooltip(el: HTMLElement, html: () => string): void {
  el.addEventListener('pointerenter', () => {
    const tip = ensure();
    tip.innerHTML = html();
    tip.classList.remove('hidden');
  });
  el.addEventListener('pointerleave', hideTooltip);
}

export function hideTooltip(): void {
  tipEl?.classList.add('hidden');
}

/** карточка предмета для тултипа */
export function itemTooltip(id: string): string {
  const def = itemDef(id);
  const rows: string[] = [`<header>${t(def.nameKey)}</header>`];
  rows.push(`<p class="tt-desc">${t(def.descKey)}</p>`);
  const add = (k: string, v: string) => rows.push(`<div class="tt-row"><span>${k}</span><b>${v}</b></div>`);
  if (def.kind === 'weapon') {
    const w = def as WeaponDef;
    add(t('hud.expDmg'), `${w.dmg.n}к${w.dmg.d}${w.dmg.plus ? '+' + w.dmg.plus : ''} + ${t('stat.' + w.dmgStat + '.short')}`);
    add(t('hud.hitChance'), w.baseAcc + '%');
    add('Дальность', String(w.range));
    add('ОД', w.apHeavy ? `${w.apLight} / ${w.apHeavy}` : String(w.apLight));
    if (w.clip) add('Магазин', `${w.clip}, перезарядка ${w.reloadAp} ОД`);
    if (w.aoe) add('Область', `${w.aoe.size}×${w.aoe.size}, поджог ${w.aoe.igniteTurns} х.`);
  } else if (def.kind === 'armor') {
    const a = def as ArmorDef;
    add(t('stat.armor'), String(a.armor));
    if (a.apPenalty) add(t('stat.ap'), '−' + a.apPenalty);
  } else if (def.kind === 'consumable') {
    const c = def as ConsumableDef;
    if (c.use.type === 'heal')
      add('Лечение', `${c.use.amount.n}к${c.use.amount.d}+${c.use.amount.plus}`);
  } else if (def.kind === 'amulet') {
    void (def as AmuletDef);
  }
  add(t('char.weight'), String(def.weight));
  return rows.join('');
}

export function perkTooltip(nameKey: string, descKey: string): string {
  return `<header>${t(nameKey)}</header><p class="tt-desc">${t(descKey)}</p>`;
}

export function itemIconHtml(def: ItemDef): string {
  return `<span class="gi" style="--icon:url(${import.meta.env.BASE_URL}assets/icons/${def.icon}.svg)"></span>`;
}
