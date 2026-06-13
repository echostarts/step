import { t } from '../core/i18n';
import { audio } from '../audio/synth';
import { iconEl } from './hud';

/** Полноэкранные оверлеи: меню, итоги, титры, пауза. */
export class Screens {
  layer: HTMLDivElement;

  constructor(parent: HTMLElement) {
    this.layer = document.createElement('div');
    this.layer.className = 'screen-layer hidden';
    parent.appendChild(this.layer);
  }

  show(content: HTMLElement, cls = ''): void {
    this.layer.innerHTML = '';
    this.layer.className = 'screen-layer ' + cls;
    this.layer.appendChild(content);
  }

  hide(): void {
    this.layer.className = 'screen-layer hidden';
    this.layer.innerHTML = '';
  }

  get visible(): boolean {
    return !this.layer.classList.contains('hidden');
  }

  // ---------- Главное меню ----------

  mainMenu(opts: {
    canContinue: boolean;
    onNew(): void;
    onContinue(): void;
    onCredits(): void;
  }): void {
    const box = el('div', 'menu-box');
    const h1 = el('h1', 'game-title');
    h1.textContent = t('game.title');
    const sub = el('div', 'game-sub');
    sub.textContent = t('game.subtitle');
    box.append(h1, sub);
    const list = el('div', 'menu-list');
    list.appendChild(menuBtn(t('menu.newGame'), opts.onNew));
    if (opts.canContinue) list.appendChild(menuBtn(t('menu.continue'), opts.onContinue));
    list.appendChild(menuBtn(t('menu.credits'), opts.onCredits));
    list.appendChild(
      menuBtn(t('menu.mute') + ': ' + (audio.muted ? 'выкл' : 'вкл'), () => {
        audio.setMuted(!audio.muted);
        this.mainMenu(opts);
      }),
    );
    box.appendChild(list);
    const foot = el('div', 'menu-foot');
    foot.textContent = 'v0.1 · Серый Орден не несёт ответственности за выживание.';
    box.appendChild(foot);
    this.show(box, 'menu-screen');
  }

  // ---------- Пауза ----------

  pauseMenu(opts: {
    onResume(): void;
    onSave(): void;
    onExport(): void;
    onRestart(): void;
    onMenu(): void;
  }): void {
    const box = el('div', 'menu-box small');
    const h = el('h2', 'screen-title');
    h.textContent = t('game.title');
    box.appendChild(h);
    const list = el('div', 'menu-list');
    list.appendChild(menuBtn(t('menu.resume'), opts.onResume));
    list.appendChild(
      menuBtn(t('menu.save'), () => {
        opts.onSave();
      }),
    );
    list.appendChild(menuBtn(t('menu.export'), opts.onExport));
    list.appendChild(menuBtn(t('menu.restart'), opts.onRestart));
    list.appendChild(
      menuBtn(t('menu.mute') + ': ' + (audio.muted ? 'выкл' : 'вкл'), () => {
        audio.setMuted(!audio.muted);
        this.pauseMenu(opts);
      }),
    );
    list.appendChild(menuBtn(t('menu.toMenu'), opts.onMenu));
    box.appendChild(list);
    this.show(box, 'pause-screen');
  }

  // ---------- Итоги боя ----------

  battleResults(opts: {
    victory: boolean;
    xp: number;
    lootHtml: string;
    injuriesHtml: string;
    onContinue(): void;
    onRestart(): void;
  }): void {
    const box = el('div', 'menu-box');
    const h = el('h2', 'screen-title ' + (opts.victory ? 'vict' : 'def'));
    h.textContent = t(opts.victory ? 'result.victory' : 'result.defeat');
    box.appendChild(h);
    if (opts.victory) {
      const xp = el('div', 'result-xp');
      xp.append(iconEl('open-book'), document.createTextNode(` ${t('result.xp')}: +${opts.xp}`));
      box.appendChild(xp);
      if (opts.lootHtml) {
        const lootH = el('h3', 'result-sub');
        lootH.textContent = t('result.loot');
        const loot = el('div', 'result-loot');
        loot.innerHTML = opts.lootHtml;
        box.append(lootH, loot);
      }
      if (opts.injuriesHtml) {
        const injH = el('h3', 'result-sub');
        injH.textContent = t('result.injury');
        const inj = el('div', 'result-injuries');
        inj.innerHTML = opts.injuriesHtml;
        box.append(injH, inj);
      }
    } else {
      const txt = el('div', 'result-text');
      txt.textContent = t('result.defeat.text');
      box.appendChild(txt);
    }
    const list = el('div', 'menu-list');
    if (opts.victory) list.appendChild(menuBtn(t('result.continue'), opts.onContinue));
    list.appendChild(menuBtn(t(opts.victory ? 'menu.restart' : 'result.restart'), opts.onRestart));
    box.appendChild(list);
    this.show(box, 'result-screen');
  }

  // ---------- Обыск ----------

  lootScreen(opts: {
    titleKey: string;
    items: { icon: string; label: string }[];
    onTakeAll(): void;
    onClose(): void;
  }): void {
    const box = el('div', 'loot-box');
    const h = el('h3', '');
    h.textContent = t(opts.titleKey);
    box.appendChild(h);
    const list = el('div', 'loot-list');
    if (!opts.items.length) {
      const p = el('p', 'sheet-note');
      p.textContent = '— пусто —';
      list.appendChild(p);
    }
    for (const it of opts.items) {
      const row = el('div', 'bp-item');
      row.appendChild(iconEl(it.icon));
      const span = el('span', '');
      span.textContent = it.label;
      row.appendChild(span);
      list.appendChild(row);
    }
    box.appendChild(list);
    const actions = el('div', 'loot-actions');
    if (opts.items.length) actions.appendChild(menuBtn(t('char.takeAll'), opts.onTakeAll));
    actions.appendChild(menuBtn(t('char.close'), opts.onClose));
    box.appendChild(actions);
    this.show(box, 'loot-screen');
  }

  // ---------- Лагерь ----------

  campScreen(opts: { onSquad(): void; onNext(): void; onMenu(): void; hasLevelUps: boolean }): void {
    const box = el('div', 'menu-box small');
    const h = el('h2', 'screen-title');
    h.textContent = t('camp.title');
    box.appendChild(h);
    const txt = el('div', 'result-text');
    txt.textContent = t('camp.text');
    box.appendChild(txt);
    const list = el('div', 'menu-list');
    const squadBtn = menuBtn(t('camp.squad') + (opts.hasLevelUps ? ' ↑' : ''), opts.onSquad);
    list.appendChild(squadBtn);
    list.appendChild(menuBtn(t('camp.next'), opts.onNext));
    list.appendChild(menuBtn(t('menu.toMenu'), opts.onMenu));
    box.appendChild(list);
    this.show(box, 'camp-screen');
  }

  // ---------- Эпилог ----------

  epilogue(opts: { titleKey: string; textKey: string; onCredits(): void; onMenu(): void }): void {
    const box = el('div', 'epilogue-box');
    const h = el('h2', '');
    h.textContent = t(opts.titleKey);
    const text = el('div', 'epilogue-text');
    text.textContent = t(opts.textKey);
    box.append(h, text);
    const list = el('div', 'menu-list');
    list.appendChild(menuBtn(t('epilogue.credits'), opts.onCredits));
    list.appendChild(menuBtn(t('epilogue.toMenu'), opts.onMenu));
    box.appendChild(list);
    this.show(box, 'epilogue-screen');
  }

  // ---------- Титры ----------

  credits(onBack: () => void): void {
    const box = el('div', 'menu-box');
    const h = el('h2', 'screen-title');
    h.textContent = t('credits.title');
    box.appendChild(h);
    const lines = ['credits.engine', 'credits.kaykit', 'credits.icons', 'credits.font', 'credits.sound'];
    const wrap = el('div', 'credits-list');
    for (const k of lines) {
      const p = el('p', 'credit-line');
      p.textContent = t(k);
      wrap.appendChild(p);
    }
    box.appendChild(wrap);
    const list = el('div', 'menu-list');
    list.appendChild(menuBtn(t('menu.back'), onBack));
    box.appendChild(list);
    this.show(box, 'credits-screen');
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}

function menuBtn(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'menu-item';
  b.textContent = label;
  b.onclick = () => {
    audio.uiClick();
    onClick();
  };
  return b;
}
