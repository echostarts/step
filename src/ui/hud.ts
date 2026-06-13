import { t } from '../core/i18n';
import { itemDef } from '../data/items';
import type { BattleScene } from '../render/battlescene';
import { portraitFor } from '../render/portrait';
import type { ConsumableDef, UnitState, WeaponDef } from '../game/types';
import { armorValue, effStat, hasPerk, maxAp, weaponOf } from '../game/unit';
import { audio } from '../audio/synth';

const ICON_BASE = import.meta.env.BASE_URL + 'assets/icons/';

export function iconEl(name: string, cls = ''): HTMLSpanElement {
  const s = document.createElement('span');
  s.className = 'gi ' + cls;
  s.style.setProperty('--icon', `url(${ICON_BASE + name}.svg)`);
  return s;
}

export interface HudCallbacks {
  onOpenMenu(): void;
  onOpenCharSheet(unitId: string): void;
}

/** Нижняя панель, инициатива, карточка врага, тосты. */
export class Hud {
  root: HTMLDivElement;
  private portraitBar: HTMLDivElement;
  private actionBar: HTMLDivElement;
  private initiative: HTMLDivElement;
  private enemyCard: HTMLDivElement;
  private toast: HTMLDivElement;
  private hintEl: HTMLDivElement;
  private scene: BattleScene | null = null;

  constructor(
    parent: HTMLElement,
    private cb: HudCallbacks,
  ) {
    this.root = div('hud');
    this.initiative = div('initiative-bar');
    this.enemyCard = div('enemy-card hidden');
    this.toast = div('toast hidden');
    this.hintEl = div('hint-line');
    this.hintEl.textContent = t('hint.move');
    const bottom = div('hud-bottom');
    this.portraitBar = div('portrait-bar');
    this.actionBar = div('action-bar');
    bottom.append(this.portraitBar, this.actionBar);
    this.root.append(this.initiative, this.enemyCard, this.toast, this.hintEl, bottom);
    parent.appendChild(this.root);
  }

  attach(scene: BattleScene): void {
    this.scene = scene;
  }

  destroy(): void {
    this.root.remove();
  }

  message(key: string): void {
    this.toast.textContent = t(key);
    this.toast.classList.remove('hidden');
    clearTimeout((this.toast as unknown as { _t?: number })._t);
    (this.toast as unknown as { _t?: number })._t = window.setTimeout(
      () => this.toast.classList.add('hidden'),
      1900,
    );
  }

  refresh(): void {
    const sc = this.scene;
    if (!sc) return;
    this.renderInitiative();
    this.renderPortraits();
    this.renderActions();
  }

  // ---------- Инициатива ----------

  private renderInitiative(): void {
    const sc = this.scene!;
    const st = sc.battle.state;
    this.initiative.innerHTML = '';
    const round = document.createElement('span');
    round.className = 'round-label';
    round.textContent = t('hud.round') + ' ' + st.round;
    this.initiative.appendChild(round);
    const vis = sc.battle.teamVisible('player');
    st.order.forEach((id, i) => {
      const u = sc.battle.unit(id);
      if (u.down) return;
      const chip = div('init-chip ' + (u.side === 'player' ? 'ally' : 'foe'));
      if (i === st.turnIdx) chip.classList.add('active');
      if (u.side === 'enemy' && !vis.has(u.pos.x + ',' + u.pos.y)) chip.classList.add('unseen');
      chip.textContent = t(u.nameKey).slice(0, 2);
      chip.title = t(u.nameKey);
      this.initiative.appendChild(chip);
    });
    if (sc.busy && sc.activeUnit?.side === 'enemy') {
      const lbl = document.createElement('span');
      lbl.className = 'enemy-turn-label';
      lbl.textContent = t('hud.enemyTurn');
      this.initiative.appendChild(lbl);
    }
  }

  // ---------- Портреты ----------

  private renderPortraits(): void {
    const sc = this.scene!;
    this.portraitBar.innerHTML = '';
    const squad = sc.battle.state.units.filter((u) => u.side === 'player');
    squad.forEach((u, i) => {
      const card = div('portrait' + (u.down ? ' down' : ''));
      if (sc.activeUnit?.id === u.id) card.classList.add('active');
      const img = document.createElement('img');
      img.alt = t(u.nameKey);
      void portraitFor(u.defId).then((url) => {
        img.src = url;
      });
      card.appendChild(img);
      const name = div('p-name');
      name.textContent = t(u.nameKey);
      card.appendChild(name);
      const hpBar = div('bar hp');
      hpBar.innerHTML = `<i style="width:${(u.hp / u.maxHp) * 100}%"></i><b>${u.hp}/${u.maxHp}</b>`;
      const apBar = div('bar ap');
      const mAp = maxAp(u);
      apBar.innerHTML = `<i style="width:${Math.min(100, (u.ap / mAp) * 100)}%"></i><b>${u.ap}</b>`;
      card.append(hpBar, apBar);
      if (u.statuses.length) {
        const stats = div('p-statuses');
        for (const s of u.statuses) {
          const ic = iconEl(s.kind === 'bleed' ? 'drop' : s.kind === 'burn' ? 'flame' : 'knockout', 'st-' + s.kind);
          ic.title = t('status.' + s.kind);
          stats.appendChild(ic);
        }
        card.appendChild(stats);
      }
      const keyHint = div('p-key');
      keyHint.textContent = String(i + 1);
      card.appendChild(keyHint);
      card.onclick = () => this.cb.onOpenCharSheet(u.id);
      this.portraitBar.appendChild(card);
    });
  }

  // ---------- Панель действий ----------

  private renderActions(): void {
    const sc = this.scene!;
    this.actionBar.innerHTML = '';
    const u = sc.activeUnit;
    if (!u || u.side !== 'player' || sc.busy || sc.battle.state.result) return;
    const w = weaponOf(u);

    const wpnBox = div('weapon-box');
    const wIcon = iconEl(w.icon, 'big');
    wIcon.title = t(w.nameKey);
    wpnBox.appendChild(wIcon);
    const wName = div('w-name');
    wName.textContent = t(w.nameKey);
    if (w.clip) wName.textContent += ` (${u.loaded}/${w.clip})`;
    wpnBox.appendChild(wName);
    this.actionBar.appendChild(wpnBox);

    // лёгкая/тяжёлая атака
    if (!w.aoe) {
      this.actionBtn(
        'crossed-swords',
        `${t('hud.attackLight')} · ${w.apLight} ОД`,
        u.ap >= w.apLight,
        sc.attackMode === 'light' && sc.targetMode.kind === 'none',
        () => {
          sc.attackMode = 'light';
          sc.targetMode = { kind: 'none' };
          this.refresh();
        },
      );
      if (w.apHeavy)
        this.actionBtn(
          'deadly-strike',
          `${t('hud.attackHeavy')} · ${w.apHeavy} ОД`,
          u.ap >= w.apHeavy,
          sc.attackMode === 'heavy',
          () => {
            sc.attackMode = 'heavy';
            sc.targetMode = { kind: 'none' };
            this.refresh();
          },
        );
    } else {
      this.actionBtn(
        'molotov',
        `${t(w.nameKey)} · ${w.apLight} ОД`,
        u.ap >= w.apLight && (!w.ammoId || sc.battle.countAmmo(u, w.ammoId) > 0),
        sc.targetMode.kind === 'aoe',
        () => {
          sc.targetMode = { kind: 'aoe', range: w.range };
          this.refresh();
        },
      );
    }
    if (w.clip && w.reloadAp)
      this.actionBtn(
        'heavy-arrow',
        `${t('hud.reload')} · ${w.reloadAp} ОД`,
        u.ap >= w.reloadAp && u.loaded < w.clip && sc.battle.countAmmo(u, w.ammoId!) > 0,
        false,
        () => void sc.doAction({ type: 'reload' }),
      );
    if (u.spareWeaponId) {
      const spare = itemDef(u.spareWeaponId) as WeaponDef;
      this.actionBtn(
        spare.icon,
        `${t('hud.swap')}: ${t(spare.nameKey)} · 1 ОД`,
        u.ap >= 1,
        false,
        () => void sc.doAction({ type: 'swapWeapon' }),
      );
    }

    // быстрые слоты
    const quick = div('quick-slots');
    u.quick.forEach((s, i) => {
      const slot = div('q-slot');
      if (s) {
        const def = itemDef(s.id);
        slot.appendChild(iconEl(def.icon));
        const cnt = document.createElement('b');
        cnt.textContent = String(s.count);
        slot.appendChild(cnt);
        slot.title = `${t(def.nameKey)} — ${t(def.descKey)}`;
        if (def.kind === 'consumable') {
          const heal = (def as ConsumableDef).use.type === 'heal';
          const cost = heal && hasPerk(u, 'apothecary') ? 2 : 4;
          slot.title += ` · ${cost} ОД`;
          if (u.ap >= cost) {
            slot.classList.add('usable');
            slot.onclick = () => {
              audio.uiClick();
              if (heal && hasPerk(u, 'apothecary')) {
                sc.targetMode = { kind: 'heal', slot: i };
                this.message('perk.apothecary');
              } else {
                void sc.doAction({ type: 'useQuick', slot: i });
              }
            };
          }
        }
      } else slot.classList.add('empty');
      quick.appendChild(slot);
    });
    this.actionBar.appendChild(quick);

    if (hasPerk(u, 'surge'))
      this.actionBtn('sprint', t('perk.surge.desc'), true, false, () =>
        void sc.doAction({ type: 'surge' }),
      );

    this.actionBtn('hourglass', t('hud.endTurn'), true, false, () => void sc.endTurnAction());

    const menuBtn = div('menu-btn');
    menuBtn.textContent = '≡';
    menuBtn.onclick = () => this.cb.onOpenMenu();
    this.actionBar.appendChild(menuBtn);
  }

  private actionBtn(
    icon: string,
    title: string,
    enabled: boolean,
    active: boolean,
    onClick: () => void,
  ): void {
    const b = div('action-btn' + (enabled ? '' : ' disabled') + (active ? ' active' : ''));
    b.appendChild(iconEl(icon));
    b.title = title;
    const lbl = div('a-label');
    lbl.textContent = title.split('·')[0].trim();
    b.appendChild(lbl);
    if (enabled)
      b.onclick = () => {
        audio.uiClick();
        onClick();
      };
    this.actionBar.appendChild(b);
  }

  // ---------- Карточка врага ----------

  showEnemyCard(enemy: UnitState | null): void {
    const sc = this.scene!;
    if (!enemy || !sc.activeUnit || sc.activeUnit.side !== 'player') {
      this.enemyCard.classList.add('hidden');
      return;
    }
    const u = sc.activeUnit;
    const pre = sc.battle.hitPreview(u, enemy, sc.attackMode);
    const err = sc.battle.canAttack(u, enemy, sc.attackMode);
    this.enemyCard.classList.remove('hidden');
    const rows: string[] = [];
    rows.push(`<header>${t(enemy.nameKey)}</header>`);
    rows.push(
      `<div class="ec-row"><span>${t('stat.hp')}</span><b>${enemy.hp}/${enemy.maxHp}</b></div>`,
    );
    if (armorValue(enemy) > 0)
      rows.push(`<div class="ec-row"><span>${t('stat.armor')}</span><b>${armorValue(enemy)}</b></div>`);
    if (enemy.statuses.length)
      rows.push(
        `<div class="ec-row"><span>—</span><b>${enemy.statuses.map((s) => t('status.' + s.kind)).join(', ')}</b></div>`,
      );
    if (err) {
      rows.push(`<div class="ec-chance blocked">${t(err)}</div>`);
    } else {
      rows.push(`<div class="ec-chance">${t('hud.hitChance')}: <b>${pre.chance}%</b></div>`);
      rows.push(
        `<div class="ec-row"><span>${t('hud.expDmg')}</span><b>${pre.dmgMin}–${pre.dmgMax}</b></div>`,
      );
      rows.push(`<div class="ec-row"><span>${t('hud.crit')}</span><b>${pre.critChance}%</b></div>`);
      const parts = pre.parts
        .filter((p) => p.val !== 0)
        .map(
          (p) =>
            `<div class="ec-part"><span>${t(p.key)}</span><b class="${p.val > 0 ? 'pos' : 'neg'}">${p.val > 0 ? '+' : ''}${p.val}</b></div>`,
        )
        .join('');
      if (parts) rows.push(`<div class="ec-parts">${parts}</div>`);
      if (pre.flanked) rows.push(`<div class="ec-flank">${t('acc.flank')}!</div>`);
    }
    this.enemyCard.innerHTML = rows.join('');
  }
}

function div(cls: string): HTMLDivElement {
  const d = document.createElement('div');
  d.className = cls;
  return d;
}
