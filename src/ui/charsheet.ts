import { t } from '../core/i18n';
import { audio } from '../audio/synth';
import {
  addToBackpack,
  applyLevelUp,
  backpackWeight,
  removeFromBackpack,
  weightLimit,
  type CampaignState,
} from '../game/campaign';
import { itemDef } from '../data/items';
import { PERKS } from '../data/perks';
import { SQUAD } from '../data/units';
import type { ItemStack, StatName, UnitState, WeaponDef } from '../game/types';
import { armorValue, critChance, dodgeOf, maxAp, XP_LEVELS } from '../game/unit';
import { portraitFor } from '../render/portrait';
import { iconEl } from './hud';
import { bindTooltip, hideTooltip, itemTooltip, perkTooltip } from './tooltip';

const STATS: StatName[] = ['str', 'dex', 'wil', 'int'];

export interface CharSheetOpts {
  campaign: CampaignState;
  /** в бою экипировку не меняем */
  inBattle: boolean;
  initialUnit?: string;
  onClose(): void;
  /** что-то поменялось (для сейва/обновления модели) */
  onChanged?(unit: UnitState): void;
}

/** Лист персонажа + инвентарь (вкладки бойцов, слоты, рюкзак отряда). */
export class CharSheet {
  root: HTMLDivElement;
  private current: string;

  constructor(
    parent: HTMLElement,
    private opts: CharSheetOpts,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'screen-layer charsheet-screen';
    parent.appendChild(this.root);
    this.current = opts.initialUnit ?? opts.campaign.squad[0].id;
    this.render();
  }

  destroy(): void {
    hideTooltip();
    this.root.remove();
  }

  private unit(): UnitState {
    return this.opts.campaign.squad.find((u) => u.id === this.current)!;
  }

  private render(): void {
    const c = this.opts.campaign;
    this.root.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'sheet-box';

    // вкладки бойцов
    const tabs = document.createElement('div');
    tabs.className = 'sheet-tabs';
    for (const u of c.squad) {
      const tab = document.createElement('div');
      tab.className = 'sheet-tab' + (u.id === this.current ? ' active' : '');
      tab.textContent = t(u.nameKey);
      if (u.perkChoice || u.unspentStat > 0) tab.classList.add('levelup');
      tab.onclick = () => {
        audio.uiClick();
        this.current = u.id;
        this.render();
      };
      tabs.appendChild(tab);
    }
    const closeBtn = document.createElement('button');
    closeBtn.className = 'sheet-close';
    closeBtn.textContent = '✕';
    closeBtn.onclick = () => {
      audio.uiClick();
      this.opts.onClose();
    };
    tabs.appendChild(closeBtn);
    box.appendChild(tabs);

    const u = this.unit();
    if (u.perkChoice) {
      box.appendChild(this.renderLevelUp(u));
      this.root.appendChild(box);
      return;
    }

    const body = document.createElement('div');
    body.className = 'sheet-body';
    body.appendChild(this.renderIdentity(u));
    body.appendChild(this.renderEquipment(u));
    body.appendChild(this.renderBackpack(u));
    box.appendChild(body);
    this.root.appendChild(box);
  }

  // ---------- Личность и статы ----------

  private renderIdentity(u: UnitState): HTMLElement {
    const col = document.createElement('div');
    col.className = 'sheet-col identity';
    const img = document.createElement('img');
    img.className = 'sheet-portrait';
    void portraitFor(u.defId).then((url) => (img.src = url));
    col.appendChild(img);
    const name = document.createElement('h3');
    name.textContent = t(u.nameKey);
    col.appendChild(name);
    const tpl = SQUAD.find((s) => s.defId === u.defId);
    if (tpl?.bioKey) {
      const bio = document.createElement('p');
      bio.className = 'sheet-bio';
      bio.textContent = t(tpl.bioKey);
      col.appendChild(bio);
    }
    const lvl = document.createElement('div');
    lvl.className = 'sheet-level';
    const nextXp = XP_LEVELS[u.level] !== undefined ? ` / ${XP_LEVELS[u.level]}` : '';
    lvl.textContent = `${t('char.level')} ${u.level} · ${t('char.xp')} ${u.xp}${nextXp}`;
    col.appendChild(lvl);

    const statsBox = document.createElement('div');
    statsBox.className = 'sheet-stats';
    for (const s of STATS) {
      const row = document.createElement('div');
      row.className = 'stat-row';
      const injury = u.injuries.filter((i) => i.stat === s).reduce((a, i) => a + i.amount, 0);
      const label = document.createElement('span');
      label.textContent = t('stat.' + s);
      const val = document.createElement('b');
      val.textContent = String(u.stats[s] - injury);
      if (injury > 0) val.classList.add('injured');
      row.append(label, val);
      if (u.unspentStat > 0 && !this.opts.inBattle) {
        const plus = document.createElement('button');
        plus.className = 'stat-plus';
        plus.textContent = '+';
        plus.onclick = () => {
          audio.uiClick();
          u.stats[s] = Math.min(10, u.stats[s] + 1);
          u.unspentStat--;
          this.opts.onChanged?.(u);
          this.render();
        };
        row.appendChild(plus);
      }
      statsBox.appendChild(row);
    }
    const derived = document.createElement('div');
    derived.className = 'sheet-derived';
    derived.innerHTML = [
      `<div><span>${t('stat.hp')}</span><b>${u.hp}/${u.maxHp}</b></div>`,
      `<div><span>${t('stat.ap')}</span><b>${maxAp(u)}</b></div>`,
      `<div><span>${t('stat.armor')}</span><b>${armorValue(u)}</b></div>`,
      `<div><span>${t('hud.crit')}</span><b>${critChance(u)}%</b></div>`,
      `<div><span>Уклонение</span><b>${dodgeOf(u)}</b></div>`,
    ].join('');
    statsBox.appendChild(derived);
    col.appendChild(statsBox);

    if (u.perks.length) {
      const ph = document.createElement('h4');
      ph.textContent = t('char.perks');
      col.appendChild(ph);
      const perksBox = document.createElement('div');
      perksBox.className = 'sheet-perks';
      for (const pid of u.perks) {
        const p = PERKS[pid];
        const chip = document.createElement('div');
        chip.className = 'perk-chip';
        chip.appendChild(iconEl(p.icon));
        chip.appendChild(document.createTextNode(t(p.nameKey)));
        bindTooltip(chip, () => perkTooltip(p.nameKey, p.descKey));
        perksBox.appendChild(chip);
      }
      col.appendChild(perksBox);
    }
    if (u.injuries.length) {
      const ih = document.createElement('h4');
      ih.textContent = t('char.injuries');
      col.appendChild(ih);
      const inj = document.createElement('div');
      inj.className = 'sheet-injuries';
      inj.textContent = u.injuries.map((i) => `−${i.amount} ${t('stat.' + i.stat)}`).join(', ');
      col.appendChild(inj);
    }
    return col;
  }

  // ---------- Экипировка ----------

  private slotEl(
    label: string,
    stack: ItemStack | null,
    onClick: (() => void) | null,
  ): HTMLElement {
    const slot = document.createElement('div');
    slot.className = 'equip-slot';
    const lbl = document.createElement('span');
    lbl.className = 'slot-label';
    lbl.textContent = label;
    slot.appendChild(lbl);
    if (stack) {
      const def = itemDef(stack.id);
      const item = document.createElement('div');
      item.className = 'slot-item';
      item.appendChild(iconEl(def.icon));
      const nm = document.createElement('span');
      nm.textContent = t(def.nameKey) + (stack.count > 1 ? ' ×' + stack.count : '');
      item.appendChild(nm);
      bindTooltip(item, () => itemTooltip(stack.id));
      if (onClick && !this.opts.inBattle) {
        item.classList.add('clickable');
        item.onclick = () => {
          audio.uiClick();
          hideTooltip();
          onClick();
        };
      }
      slot.appendChild(item);
    } else {
      const empty = document.createElement('div');
      empty.className = 'slot-item empty';
      empty.textContent = '—';
      slot.appendChild(empty);
    }
    return slot;
  }

  private renderEquipment(u: UnitState): HTMLElement {
    const c = this.opts.campaign;
    const col = document.createElement('div');
    col.className = 'sheet-col equipment';
    const h = document.createElement('h4');
    h.textContent = t('char.inventory');
    col.appendChild(h);

    const changed = () => {
      this.opts.onChanged?.(u);
      this.render();
    };

    col.appendChild(
      this.slotEl(t('char.slot.weapon'), { id: u.weaponId, count: 1 }, null),
    );
    col.appendChild(
      this.slotEl(
        t('char.slot.spare'),
        u.spareWeaponId ? { id: u.spareWeaponId, count: 1 } : null,
        u.spareWeaponId
          ? () => {
              addToBackpack(c, { id: u.spareWeaponId!, count: 1 });
              u.spareWeaponId = null;
              changed();
            }
          : null,
      ),
    );
    col.appendChild(
      this.slotEl(
        t('char.slot.armor'),
        u.armorId ? { id: u.armorId, count: 1 } : null,
        u.armorId
          ? () => {
              addToBackpack(c, { id: u.armorId!, count: 1 });
              u.armorId = null;
              changed();
            }
          : null,
      ),
    );
    col.appendChild(
      this.slotEl(
        t('char.slot.amulet'),
        u.amuletId ? { id: u.amuletId, count: 1 } : null,
        u.amuletId
          ? () => {
              addToBackpack(c, { id: u.amuletId!, count: 1 });
              u.amuletId = null;
              changed();
            }
          : null,
      ),
    );
    const qh = document.createElement('h4');
    qh.textContent = t('char.slot.quick');
    col.appendChild(qh);
    u.quick.forEach((s, i) => {
      col.appendChild(
        this.slotEl(
          String(i + 1),
          s,
          s
            ? () => {
                addToBackpack(c, { ...s });
                u.quick[i] = null;
                changed();
              }
            : null,
        ),
      );
    });
    if (this.opts.inBattle) {
      const note = document.createElement('p');
      note.className = 'sheet-note';
      note.textContent = 'В бою снаряжение не перекладывают.';
      col.appendChild(note);
    }
    return col;
  }

  // ---------- Рюкзак ----------

  private renderBackpack(u: UnitState): HTMLElement {
    const c = this.opts.campaign;
    const col = document.createElement('div');
    col.className = 'sheet-col backpack';
    const h = document.createElement('h4');
    h.textContent = t('char.backpack');
    col.appendChild(h);
    const w = backpackWeight(c);
    const lim = weightLimit(c);
    const wbar = document.createElement('div');
    wbar.className = 'weight-bar' + (w > lim ? ' over' : '');
    wbar.innerHTML = `<span>${t('char.weight')}: ${w} / ${lim}</span><i style="width:${Math.min(100, (w / lim) * 100)}%"></i>`;
    col.appendChild(wbar);

    const list = document.createElement('div');
    list.className = 'backpack-list';
    const changed = () => {
      this.opts.onChanged?.(u);
      this.render();
    };
    if (!c.backpack.length) {
      const empty = document.createElement('p');
      empty.className = 'sheet-note';
      empty.textContent = '— пусто —';
      list.appendChild(empty);
    }
    for (const s of [...c.backpack]) {
      const def = itemDef(s.id);
      const row = document.createElement('div');
      row.className = 'bp-item';
      row.appendChild(iconEl(def.icon));
      const nm = document.createElement('span');
      nm.textContent = t(def.nameKey) + (s.count > 1 ? ' ×' + s.count : '');
      row.appendChild(nm);
      bindTooltip(row, () => itemTooltip(s.id));
      if (!this.opts.inBattle) {
        const act = document.createElement('button');
        act.className = 'bp-equip';
        act.textContent = t('char.equip');
        act.onclick = (e) => {
          e.stopPropagation();
          audio.uiClick();
          hideTooltip();
          this.equipFromBackpack(u, s.id);
          changed();
        };
        if (this.canEquip(def.kind)) row.appendChild(act);
      }
      list.appendChild(row);
    }
    col.appendChild(list);
    return col;
  }

  private canEquip(kind: string): boolean {
    return kind === 'weapon' || kind === 'armor' || kind === 'amulet' || kind === 'consumable' || kind === 'ammo';
  }

  private equipFromBackpack(u: UnitState, id: string): void {
    const c = this.opts.campaign;
    const def = itemDef(id);
    if (def.kind === 'weapon') {
      if (!removeFromBackpack(c, id)) return;
      // в основную руку; прежнее — в запас; запасное — в рюкзак
      if (u.spareWeaponId) addToBackpack(c, { id: u.spareWeaponId, count: 1 });
      u.spareWeaponId = u.weaponId;
      u.spareLoaded = u.loaded;
      u.weaponId = id;
      u.loaded = (def as WeaponDef).clip ?? 0;
    } else if (def.kind === 'armor') {
      if (!removeFromBackpack(c, id)) return;
      if (u.armorId) addToBackpack(c, { id: u.armorId, count: 1 });
      u.armorId = id;
    } else if (def.kind === 'amulet') {
      if (!removeFromBackpack(c, id)) return;
      if (u.amuletId) addToBackpack(c, { id: u.amuletId, count: 1 });
      u.amuletId = id;
    } else {
      // расходник/боезапас — в свободный быстрый слот (или в стопку)
      const stackIdx = u.quick.findIndex((q) => q && q.id === id && def.stack);
      const freeIdx = stackIdx >= 0 ? stackIdx : u.quick.findIndex((q) => q === null);
      if (freeIdx < 0) return;
      if (!removeFromBackpack(c, id)) return;
      const cur = u.quick[freeIdx];
      if (cur && cur.id === id) cur.count++;
      else u.quick[freeIdx] = { id, count: 1 };
    }
  }

  // ---------- Левел-ап ----------

  private renderLevelUp(u: UnitState): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'levelup-box';
    const h = document.createElement('h3');
    h.className = 'screen-title';
    h.textContent = `${t('level.up')} — ${t(u.nameKey)}`;
    wrap.appendChild(h);

    let chosenStat: StatName | null = null;
    let chosenPerk: string | null = null;

    const sh = document.createElement('h4');
    sh.textContent = t('level.pickStat');
    wrap.appendChild(sh);
    const statRow = document.createElement('div');
    statRow.className = 'levelup-stats';
    const statBtns = new Map<StatName, HTMLButtonElement>();
    for (const s of STATS) {
      const b = document.createElement('button');
      b.className = 'levelup-stat';
      b.innerHTML = `${t('stat.' + s)} <b>${u.stats[s]} → ${Math.min(10, u.stats[s] + 1)}</b>`;
      b.onclick = () => {
        audio.uiClick();
        chosenStat = s;
        statBtns.forEach((bb) => bb.classList.remove('chosen'));
        b.classList.add('chosen');
        refresh();
      };
      statBtns.set(s, b);
      statRow.appendChild(b);
    }
    wrap.appendChild(statRow);

    const ph = document.createElement('h4');
    ph.textContent = t('level.pickPerk');
    wrap.appendChild(ph);
    const perkRow = document.createElement('div');
    perkRow.className = 'levelup-perks';
    const perkBtns: HTMLElement[] = [];
    for (const pid of u.perkChoice ?? []) {
      const p = PERKS[pid];
      const card = document.createElement('div');
      card.className = 'perk-card';
      card.appendChild(iconEl(p.icon, 'big'));
      const nm = document.createElement('h5');
      nm.textContent = t(p.nameKey);
      const ds = document.createElement('p');
      ds.textContent = t(p.descKey);
      card.append(nm, ds);
      card.onclick = () => {
        audio.uiClick();
        chosenPerk = pid;
        perkBtns.forEach((c2) => c2.classList.remove('chosen'));
        card.classList.add('chosen');
        refresh();
      };
      perkBtns.push(card);
      perkRow.appendChild(card);
    }
    wrap.appendChild(perkRow);

    const confirm = document.createElement('button');
    confirm.className = 'menu-item confirm';
    confirm.textContent = t('level.confirm');
    confirm.disabled = true;
    confirm.onclick = () => {
      audio.uiClick();
      applyLevelUp(u, chosenStat!, chosenPerk!);
      this.opts.onChanged?.(u);
      this.render();
    };
    const refresh = () => {
      confirm.disabled = !(chosenStat && chosenPerk);
    };
    wrap.appendChild(confirm);
    return wrap;
  }
}
