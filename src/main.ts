import './style.css';
import '@fontsource/grenze-gotisch/400.css';
import '@fontsource/grenze-gotisch/600.css';
import * as THREE from 'three';
import { t } from './core/i18n';
import { Battle } from './game/combat';
import {
  addToBackpack,
  awardXp,
  campaignRng,
  clearSave,
  exportSave,
  importSave,
  loadCampaign,
  newCampaign,
  removeFromBackpack,
  restSquad,
  saveCampaign,
  type CampaignState,
} from './game/campaign';
import type { DlgEffect } from './game/dialogue';
import { Grid } from './game/grid';
import type { ItemStack, StatName, UnitState, Vec2 } from './game/types';
import { makeUnit } from './game/unit';
import { ENEMIES } from './data/units';
import { DIALOGUES } from './data/dialogues';
import { mapDef } from './data/maps';
import { itemDef } from './data/items';
import { audio } from './audio/synth';
import { IsoScene } from './render/scene';
import { BattleScene } from './render/battlescene';
import { ExploreScene, type NpcSpawn } from './render/explorescene';
import { Hud } from './ui/hud';
import { Screens } from './ui/screens';
import { CharSheet } from './ui/charsheet';
import { DialogueView } from './ui/dialogue';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const labels = document.getElementById('labels') as HTMLDivElement;
const uiRoot = document.getElementById('ui') as HTMLDivElement;

const iso = new IsoScene(canvas);
const screens = new Screens(uiRoot);
audio.loadMuted();

/** сид: ?seed=… в URL, по умолчанию случайный, но фиксируется в адресе */
function seedString(): string {
  const url = new URL(location.href);
  let s = url.searchParams.get('seed');
  if (!s) {
    s = Math.floor(Math.random() * 1e9).toString(36);
    url.searchParams.set('seed', s);
    history.replaceState(null, '', url.toString());
  }
  return s;
}

// ---------- Состояние приложения ----------

interface App {
  campaign: CampaignState | null;
  battleScene: BattleScene | null;
  exploreScene: ExploreScene | null;
  hud: Hud | null;
  charSheet: CharSheet | null;
  dialogue: DialogueView | null;
  mode: 'menu' | 'battle' | 'camp' | 'explore' | 'dialogue' | 'epilogue';
}

const app: App = {
  campaign: null,
  battleScene: null,
  exploreScene: null,
  hud: null,
  charSheet: null,
  dialogue: null,
  mode: 'menu',
};
// отладочный доступ (используется e2e-смоуком)
(window as unknown as { __app: App }).__app = app;
(window as unknown as { __project: (x: number, y: number) => { x: number; y: number } }).__project =
  (cx, cy) => {
    const v = new THREE.Vector3(cx * 2, 0, cy * 2).project(iso.camera);
    return {
      x: ((v.x + 1) / 2) * window.innerWidth,
      y: ((1 - v.y) / 2) * window.innerHeight,
    };
  };

const VILLAGE_NPCS: NpcSpawn[] = [
  { defId: 'npc_elder', dialogue: 'elder', x: 7, y: 8 },
  { defId: 'npc_herbalist', dialogue: 'herbalist', x: 31, y: 10 },
  { defId: 'npc_boy', dialogue: 'boy', x: 23, y: 15 },
];

// ---------- Маршрутизатор сцен ----------

function gotoScene(scene: string): void {
  const c = app.campaign;
  if (!c) return;
  c.scene = scene;
  saveCampaign(c);
  switch (scene) {
    case 'intro':
      showDialogue('intro');
      break;
    case 'battle1':
      void startBattle('outskirts', 'battle1').catch((e) => console.error('battle failed', e));
      break;
    case 'camp':
      showCamp();
      break;
    case 'village':
      void startExplore().catch((e) => console.error('explore failed', e));
      break;
    case 'chapel_door':
      showDialogue('abbot');
      break;
    case 'battle2':
      void startBattle('chapel', 'battle2').catch((e) => console.error('battle failed', e));
      break;
    case 'relic':
      showDialogue('relic');
      break;
    case 'battle_final':
      void startBattle('chapel', 'battle_final').catch((e) => console.error('battle failed', e));
      break;
    case 'epilogue_order':
      showEpilogue('order');
      break;
    case 'epilogue_destroy':
      showEpilogue('destroy');
      break;
    case 'epilogue_keep':
      showEpilogue('keep');
      break;
    default:
      showMainMenu();
  }
}

async function disposeScenes(): Promise<void> {
  app.battleScene?.dispose();
  app.exploreScene?.dispose();
  app.hud?.destroy();
  app.dialogue?.destroy();
  app.charSheet?.destroy();
  app.battleScene = null;
  app.exploreScene = null;
  app.hud = null;
  app.dialogue = null;
  app.charSheet = null;
  clearExploreUi();
}

// ---------- Диалоги ----------

function applyEffect(e: DlgEffect): void {
  const c = app.campaign!;
  switch (e.type) {
    case 'flag':
      c.flags[e.key] = e.value ?? true;
      break;
    case 'giveItem':
      addToBackpack(c, { id: e.id, count: e.count ?? 1 });
      break;
    case 'takeItem':
      removeFromBackpack(c, e.id, e.count ?? 1);
      break;
    case 'xp':
      awardXp(c, e.amount);
      break;
    case 'goto':
      break;
  }
  saveCampaign(c);
}

function showDialogue(id: string): void {
  const c = app.campaign!;
  app.dialogue?.destroy();
  const wasExplore = app.mode === 'explore';
  app.mode = 'dialogue';
  screens.hide();
  app.dialogue = new DialogueView(uiRoot, DIALOGUES[id], c, {
    onEffect: applyEffect,
    onGoto: (scene) => {
      app.dialogue?.destroy();
      app.dialogue = null;
      if (scene !== 'village' || !wasExplore) void disposeScenes();
      gotoScene(scene);
    },
    onEnd: () => {
      app.dialogue?.destroy();
      app.dialogue = null;
      if (wasExplore && app.exploreScene) {
        app.mode = 'explore';
        saveCampaign(c);
      } else {
        // диалог поверх пустоты — вернуться в деревню или меню по сцене
        gotoScene(c.scene === 'intro' ? 'battle1' : c.scene);
      }
    },
  });
}

function showEpilogue(kind: 'order' | 'destroy' | 'keep'): void {
  void disposeScenes();
  app.mode = 'epilogue';
  audio.stopDrone();
  audio.sting(true);
  screens.epilogue({
    titleKey: `epilogue.${kind}.title`,
    textKey: `epilogue.${kind}`,
    onCredits: () => screens.credits(() => showMainMenu()),
    onMenu: () => showMainMenu(),
  });
}

// ---------- Исследование деревни ----------

let exploreUi: HTMLElement[] = [];

async function startExplore(): Promise<void> {
  const c = app.campaign!;
  await disposeScenes();
  restSquad(c);
  app.mode = 'explore';
  const scene = new ExploreScene(iso, 'village', c.squad, VILLAGE_NPCS, {
    onTalk: (dialogueId) => showDialogue(dialogueId),
    onTrigger: (event) => {
      if (event === 'chapel') {
        if (c.flags.battle2_avoided || c.flags.battle2_done) gotoScene('relic');
        else gotoScene('chapel_door');
      }
    },
  });
  app.exploreScene = scene;
  const note = document.createElement('div');
  note.className = 'loading-note';
  note.textContent = '…ставни закрыты, но за ними дышат';
  uiRoot.appendChild(note);
  await scene.init();
  note.remove();
  screens.hide();
  audio.startDrone();

  const title = document.createElement('div');
  title.className = 'explore-title';
  title.textContent = t('village.enter');
  const hint = document.createElement('div');
  hint.className = 'explore-hint';
  hint.textContent = t('village.hint');
  const squadBtn = document.createElement('button');
  squadBtn.className = 'explore-squad-btn';
  squadBtn.textContent = t('camp.squad');
  squadBtn.onclick = () => openCharSheet();
  uiRoot.append(title, hint, squadBtn);
  exploreUi = [title, hint, squadBtn];
}

function clearExploreUi(): void {
  for (const el of exploreUi) el.remove();
  exploreUi = [];
}

// ---------- Бои ----------

type BattleScenario = 'battle1' | 'battle2' | 'battle_final';

/** собрать врагов по сценарию (диалоги меняют состав) */
function buildEnemies(c: CampaignState, scenario: BattleScenario): UnitState[] {
  const out: UnitState[] = [];
  if (scenario === 'battle1') {
    const grid = new Grid(mapDef('outskirts'));
    const cells = grid.enemySpawns('1');
    cells.forEach((cell, i) => {
      const tpl = i === cells.length - 1 ? ENEMIES.ghul_brute : ENEMIES.ghul;
      const e = makeUnit(tpl, 'en_' + i);
      e.pos = { ...cell };
      out.push(e);
    });
  } else if (scenario === 'battle2') {
    const grid = new Grid(mapDef('chapel'));
    const cultCells = grid.enemySpawns('1');
    const types = ['cultist', 'cultist_crossbow', 'cultist_alchemist', 'cultist', 'cultist_crossbow'];
    // ослабленный бой: культисты дрогнули — остаются двое и настоятель
    const count = c.flags.battle2_weak ? 2 : cultCells.length;
    for (let i = 0; i < count; i++) {
      const e = makeUnit(ENEMIES[types[i % types.length]], 'en_c' + i);
      e.pos = { ...cultCells[i] };
      out.push(e);
    }
    const abbotCell = grid.enemySpawns('2')[0];
    const abbot = makeUnit(ENEMIES.abbot, 'en_abbot');
    abbot.pos = { ...abbotCell };
    out.push(abbot);
  } else {
    // финал «уничтожить»: настоятель в усиленной форме, лежавшие встают
    const grid = new Grid(mapDef('chapel'));
    const cell = grid.enemySpawns('3')[0];
    const boss = makeUnit(ENEMIES.abbot_ascended, 'en_ascended');
    boss.pos = { ...cell };
    out.push(boss);
    const cultCells = grid.enemySpawns('1');
    for (let i = 0; i < 3; i++) {
      const e = makeUnit(ENEMIES.ghul, 'en_g' + i);
      e.pos = { ...cultCells[i] };
      out.push(e);
    }
  }
  return out;
}

async function startBattle(mapId: string, scenario: BattleScenario): Promise<void> {
  const c = app.campaign!;
  await disposeScenes();
  clearExploreUi();
  restSquad(c);
  const def = mapDef(mapId);
  const grid = new Grid(def);
  const ps = grid.playerSpawns();
  c.squad.forEach((u, i) => {
    u.pos = { ...ps[i % ps.length] };
  });
  c.battleCounter++;
  c.flags.scenario = scenario;
  const seed = campaignRng(c, 'battle:' + c.battleCounter).state;
  const battle = Battle.create(mapId, [...c.squad, ...buildEnemies(c, scenario)], seed);
  c.battle = battle.state;
  c.battleFlags = [];
  c.fogExplored = [];
  saveCampaign(c);
  await mountBattle(battle, true);
}

/** возобновить сохранённый бой */
async function resumeBattle(): Promise<void> {
  const c = app.campaign!;
  if (!c.battle) return;
  await disposeScenes();
  const battle = new Battle(c.battle, c.battleFlags);
  c.squad = c.battle.units.filter((u) => u.side === 'player');
  await mountBattle(battle, false);
}

async function mountBattle(battle: Battle, fresh: boolean): Promise<void> {
  const c = app.campaign!;
  const hud = new Hud(uiRoot, {
    onOpenMenu: openPauseMenu,
    onOpenCharSheet: (unitId) => openCharSheet(unitId),
  });
  let lastPersist = 0;
  const scene = new BattleScene(iso, battle, labels, {
    onHudRefresh: () => {
      hud.refresh();
      // автосейв по сменам ходов, не чаще раза в 4 секунды
      if (Date.now() - lastPersist > 4000 && !app.battleScene?.busy) {
        lastPersist = Date.now();
        persistMidBattle();
      }
    },
    onBattleEnd: (result) => onBattleEnd(result),
    onMessage: (key) => hud.message(key),
    onEnemyHover: (u) => hud.showEnemyCard(u),
    onLoot: (at, body) => onBattleLoot(at, body),
  });
  hud.attach(scene);
  app.battleScene = scene;
  app.hud = hud;
  app.mode = 'battle';

  const note = document.createElement('div');
  note.className = 'loading-note';
  note.textContent = '…отряд занимает позиции';
  uiRoot.appendChild(note);
  await scene.init();
  if (c.fogExplored.length) {
    scene.fog.restore(c.fogExplored);
    scene.refreshVisibility();
  }
  note.remove();
  screens.hide();
  audio.startDrone();

  if (fresh) {
    const events = battle.begin();
    await scene.playEvents(events);
  }
  scene.refreshVisibility();
  scene.refreshOverlays();
  void scene.maybeRunAI();
}

/** записать кампанию вместе с текущим боем */
function persistMidBattle(): void {
  const c = app.campaign;
  const scene = app.battleScene;
  if (!c || !scene) return;
  c.battle = scene.battle.state;
  c.battleFlags = scene.battle.serializeFlags();
  c.fogExplored = scene.fog.serialize();
  saveCampaign(c);
}

// ---------- Обыск ----------

function lootKey(mapId: string, at: Vec2): string {
  return 'loot:' + mapId + ':' + at.x + ',' + at.y;
}

function onBattleLoot(at: Vec2, body: UnitState | null): void {
  const c = app.campaign!;
  const scene = app.battleScene!;
  let items: ItemStack[] = [];
  let titleKey = 'loot.body';
  if (body) {
    const tpl = ENEMIES[body.defId];
    items = body.looted ? [] : (tpl?.drops ?? []);
  } else {
    titleKey = 'loot.chest';
    if (!c.flags[lootKey(scene.battle.state.mapId, at)]) {
      const def = mapDef(scene.battle.state.mapId);
      items = def.loot?.find((l) => l.x === at.x && l.y === at.y)?.items ?? [];
    }
  }
  audio.uiClick();
  screens.lootScreen({
    titleKey,
    items: items.map((s) => {
      const d = itemDef(s.id);
      return { icon: d.icon, label: t(d.nameKey) + (s.count > 1 ? ' ×' + s.count : '') };
    }),
    onTakeAll: () => {
      for (const s of items) addToBackpack(c, { ...s });
      if (body) body.looted = true;
      else c.flags[lootKey(scene.battle.state.mapId, at)] = true;
      persistMidBattle();
      screens.hide();
      app.hud?.message('result.loot');
    },
    onClose: () => screens.hide(),
  });
}

// ---------- Конец боя ----------

function onBattleEnd(result: 'victory' | 'defeat'): void {
  const c = app.campaign!;
  const scene = app.battleScene;
  if (!scene) return;
  audio.sting(result === 'victory');
  const st = scene.battle.state;
  const scenario = (c.flags.scenario as BattleScenario) ?? 'battle1';

  if (result === 'defeat') {
    setTimeout(() => {
      screens.battleResults({
        victory: false,
        xp: 0,
        lootHtml: '',
        injuriesHtml: '',
        onContinue: () => void 0,
        onRestart: () => void startBattle(st.mapId, scenario),
      });
    }, 900);
    return;
  }

  // травмы поднявшихся
  const rng = campaignRng(c, 'injury:' + c.battleCounter);
  const stats: StatName[] = ['str', 'dex', 'wil', 'int'];
  const downed = st.units.filter((u) => u.side === 'player' && u.down);
  const injuriesHtml = downed
    .map((u) => {
      const stat = rng.pick(stats);
      u.injuries.push({ stat, amount: 1 });
      return `${t(u.nameKey)} — <span class="neg">−1 ${t('stat.' + stat)}</span>`;
    })
    .join('<br>');

  // добыча: непрочёсанные тела, сундуки карты и сюжетные находки
  const lootStacks: ItemStack[] = [];
  for (const u of st.units) {
    if (u.side !== 'enemy' || !u.down || u.looted) continue;
    for (const s of ENEMIES[u.defId]?.drops ?? []) lootStacks.push({ ...s });
  }
  for (const l of mapDef(st.mapId).loot ?? []) {
    if (!c.flags[lootKey(st.mapId, l)]) {
      for (const s of l.items) lootStacks.push({ ...s });
      c.flags[lootKey(st.mapId, l)] = true;
    }
  }
  if (scenario === 'battle1' && !c.flags.got_letter) {
    c.flags.got_letter = true;
    lootStacks.push({ id: 'abbot_letter', count: 1 });
  }
  for (const s of lootStacks) addToBackpack(c, s);
  const lootHtml = lootStacks
    .map((s) => {
      const d = itemDef(s.id);
      return `<span class="gi" style="--icon:url(${import.meta.env.BASE_URL}assets/icons/${d.icon}.svg)"></span> ${t(d.nameKey)}${s.count > 1 ? ' ×' + s.count : ''}`;
    })
    .join('<br>');

  // опыт всем членам отряда
  awardXp(c, st.xpAwarded);
  c.battle = null;
  c.battleFlags = [];
  if (scenario === 'battle2') c.flags.battle2_done = true;
  saveCampaign(c);

  setTimeout(() => {
    screens.battleResults({
      victory: true,
      xp: st.xpAwarded,
      lootHtml,
      injuriesHtml,
      onContinue: () => {
        void disposeScenes();
        if (scenario === 'battle1') gotoScene('camp');
        else if (scenario === 'battle2') gotoScene('relic');
        else gotoScene('epilogue_destroy');
      },
      onRestart: () => void startBattle(st.mapId, scenario),
    });
  }, 900);
}

// ---------- Лагерь ----------

function showCamp(): void {
  const c = app.campaign!;
  app.mode = 'camp';
  c.scene = 'camp';
  saveCampaign(c);
  screens.campScreen({
    hasLevelUps: c.squad.some((u) => u.perkChoice || u.unspentStat > 0),
    onSquad: () => openCharSheet(),
    onNext: () => gotoScene('village'),
    onMenu: () => showMainMenu(),
  });
}

// ---------- Лист персонажа ----------

function openCharSheet(unitId?: string): void {
  const c = app.campaign;
  if (!c || app.charSheet) return;
  app.charSheet = new CharSheet(uiRoot, {
    campaign: c,
    inBattle: app.mode === 'battle',
    initialUnit: unitId,
    onClose: () => {
      app.charSheet?.destroy();
      app.charSheet = null;
      saveCampaign(c);
      if (app.mode === 'camp') showCamp();
    },
    onChanged: () => {
      saveCampaign(c);
      app.hud?.refresh();
    },
  });
  if (app.mode === 'camp') screens.hide();
}

// ---------- Меню ----------

function openPauseMenu(): void {
  screens.pauseMenu({
    onResume: () => screens.hide(),
    onSave: () => {
      persistMidBattle();
      app.hud?.message('menu.saved');
      screens.hide();
    },
    onExport: () => {
      persistMidBattle();
      const c = app.campaign;
      if (c) {
        void navigator.clipboard?.writeText(exportSave(c)).catch(() => void 0);
        app.hud?.message('menu.exportDone');
      }
      screens.hide();
    },
    onRestart: () => {
      screens.hide();
      const mapId = app.battleScene?.battle.state.mapId ?? 'outskirts';
      const scenario = (app.campaign?.flags.scenario as BattleScenario) ?? 'battle1';
      void startBattle(mapId, scenario);
    },
    onMenu: () => {
      persistMidBattle();
      void disposeScenes();
      clearExploreUi();
      showMainMenu();
    },
  });
}

function showMainMenu(): void {
  void disposeScenes();
  clearExploreUi();
  app.mode = 'menu';
  audio.stopDrone();
  const saved = loadCampaign();
  screens.mainMenu({
    canContinue: !!saved,
    onNew: () => {
      clearSave();
      app.campaign = newCampaign(seedString());
      gotoScene('intro');
    },
    onContinue: () => {
      const c = loadCampaign();
      if (!c) return;
      app.campaign = c;
      if (c.battle && !c.battle.result) {
        void resumeBattle().catch((e) => console.error('resume failed', e));
      } else {
        gotoScene(c.scene === 'intro' ? 'intro' : c.scene);
      }
    },
    onCredits: () => screens.credits(() => showMainMenu()),
  });
}

// импорт сейва строкой — Ctrl+I в главном меню
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyI' && e.ctrlKey && app.mode === 'menu') {
    const s = prompt(t('menu.importPrompt'));
    if (!s) return;
    const c = importSave(s);
    if (c) {
      app.campaign = c;
      saveCampaign(c);
      if (c.battle && !c.battle.result) void resumeBattle();
      else gotoScene(c.scene);
    } else alert(t('menu.importFail'));
  }
});

// ---------- Ввод ----------

canvas.addEventListener('pointermove', (e) => {
  app.battleScene?.onPointerMove(e);
});
canvas.addEventListener('pointerdown', (e) => {
  if (screens.visible || app.charSheet || app.dialogue) return;
  if (e.button === 0) {
    void app.battleScene?.onClick(e);
    void app.exploreScene?.onClick(e);
  } else if (e.button === 2) app.battleScene?.onRightClick();
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    iso.setZoom(e.deltaY > 0 ? 1.12 : 0.9);
  },
  { passive: false },
);

const keysDown = new Set<string>();
window.addEventListener('keydown', (e) => {
  keysDown.add(e.code);
  if (app.mode !== 'battle' && app.mode !== 'explore') return;
  switch (e.code) {
    case 'KeyQ':
      iso.rotate(1);
      break;
    case 'KeyE':
      iso.rotate(-1);
      break;
    case 'Space':
      e.preventDefault();
      if (!screens.visible && !app.charSheet && !app.dialogue)
        void app.battleScene?.endTurnAction();
      break;
    case 'Tab':
      e.preventDefault();
      app.battleScene?.cycleTarget();
      break;
    case 'Escape':
      if (app.charSheet) {
        app.charSheet.destroy();
        app.charSheet = null;
      } else if (screens.visible) screens.hide();
      else openPauseMenu();
      break;
    case 'Digit1':
    case 'Digit2':
    case 'Digit3':
    case 'Digit4': {
      const scene = app.battleScene;
      if (!scene) break;
      const idx = Number(e.code.slice(-1)) - 1;
      const squad = scene.battle.state.units.filter((u) => u.side === 'player');
      const u = squad[idx];
      if (u && !u.down) iso.lookAtCell(u.pos.x, u.pos.y);
      break;
    }
  }
});
window.addEventListener('keyup', (e) => keysDown.delete(e.code));

// ---------- Цикл ----------

let last = performance.now();
function frame(): void {
  requestAnimationFrame(frame);
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  // панорамирование стрелками/WASD в системе координат камеры
  if ((app.mode === 'battle' || app.mode === 'explore') && !screens.visible && !app.charSheet) {
    const sp = 24 * dt;
    let dx = 0;
    let dz = 0;
    if (keysDown.has('ArrowUp') || keysDown.has('KeyW')) dz -= sp;
    if (keysDown.has('ArrowDown') || keysDown.has('KeyS')) dz += sp;
    if (keysDown.has('ArrowLeft') || keysDown.has('KeyA')) dx -= sp;
    if (keysDown.has('ArrowRight') || keysDown.has('KeyD')) dx += sp;
    if (dx || dz) {
      const a = iso.angle;
      iso.panWorld(dx * Math.cos(a) - dz * Math.sin(a), -dx * Math.sin(a) - dz * Math.cos(a));
    }
  }
  iso.update(dt);
  app.battleScene?.update(dt, now / 1000);
  app.exploreScene?.update(dt, now / 1000);
  iso.render();
}
frame();

showMainMenu();
