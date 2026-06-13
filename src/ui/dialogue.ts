import { t } from '../core/i18n';
import { audio } from '../audio/synth';
import type { CampaignState } from '../game/campaign';
import type { Dialogue, DlgEffect, DlgNode, DlgOption } from '../game/dialogue';
import { optionEnabled, optionVisible } from '../game/dialogue';
import { portraitFor } from '../render/portrait';

export interface DialogueHandlers {
  /** применить эффект (flag/giveItem/xp); goto обрабатывает контроллер */
  onEffect(e: DlgEffect): void;
  onGoto(scene: string): void;
  onEnd(): void;
}

/**
 * Окно диалога: портрет говорящего (рендер бюста модели), текст,
 * опции с чеками статов («[Воля 6] …») и условиями по флагам.
 */
export class DialogueView {
  root: HTMLDivElement;
  private node: DlgNode;

  constructor(
    parent: HTMLElement,
    private dlg: Dialogue,
    private campaign: CampaignState,
    private handlers: DialogueHandlers,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'dialogue-layer';
    parent.appendChild(this.root);
    this.node = dlg.nodes[dlg.start];
    this.render();
  }

  destroy(): void {
    this.root.remove();
  }

  private pick(o: DlgOption): void {
    audio.uiClick();
    let goto: string | null = null;
    for (const e of o.effects ?? []) {
      if (e.type === 'goto') goto = e.scene;
      else this.handlers.onEffect(e);
    }
    if (goto) {
      this.handlers.onGoto(goto);
      return;
    }
    if (o.next) {
      this.node = this.dlg.nodes[o.next];
      this.render();
    } else {
      this.handlers.onEnd();
    }
  }

  private render(): void {
    const n = this.node;
    this.root.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'dialogue-box';

    if (n.speaker !== 'narrator') {
      const side = document.createElement('div');
      side.className = 'dlg-portrait';
      const img = document.createElement('img');
      void portraitFor(n.speaker).then((url) => {
        if (url) img.src = url;
      });
      side.appendChild(img);
      if (n.speakerNameKey) {
        const nm = document.createElement('div');
        nm.className = 'dlg-name';
        nm.textContent = t(n.speakerNameKey);
        side.appendChild(nm);
      }
      box.appendChild(side);
    }

    const main = document.createElement('div');
    main.className = 'dlg-main' + (n.speaker === 'narrator' ? ' narrator' : '');
    const text = document.createElement('p');
    text.className = 'dlg-text';
    text.textContent = t(n.textKey);
    main.appendChild(text);

    const opts = document.createElement('div');
    opts.className = 'dlg-options';
    for (const o of n.options) {
      if (!optionVisible(this.campaign, o)) continue;
      const enabled = optionEnabled(this.campaign, o);
      const btn = document.createElement('button');
      btn.className = 'dlg-option' + (enabled ? '' : ' locked');
      btn.textContent = t(o.textKey);
      if (!enabled && o.check) {
        btn.textContent += ` — ${t('dlg.option.locked')} (${t('stat.' + o.check.stat)} ${o.check.value})`;
      }
      if (enabled) btn.onclick = () => this.pick(o);
      opts.appendChild(btn);
    }
    main.appendChild(opts);
    box.appendChild(main);
    this.root.appendChild(box);
  }
}
