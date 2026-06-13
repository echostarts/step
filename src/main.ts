import './style.css';
import '@fontsource/grenze-gotisch/400.css';
import '@fontsource/grenze-gotisch/600.css';
import { hashSeed } from './core/rng';
import { t } from './core/i18n';
import { Battle } from './game/combat';
import type { UnitState } from './game/types';
import { makeUnit } from './game/unit';
import { ENEMIES, SQUAD } from './data/units';
import { mapDef } from './data/maps';
import { audio } from './audio/synth';
import { IsoScene } from './render/scene';
import { BattleScene } from './render/battlescene';
import { Hud } from './ui/hud';
import { Screens } from './ui/screens';
import { itemDef } from './data/items';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const labels = document.getElementById('labels') as HTMLDivElement;
const uiRoot = document.getElementById('ui') as HTMLDivElement;

const iso = new IsoScene(canvas);
const screens = new Screens(uiRoot);
audio.loadMuted();

/** сид: ?seed=… в URL, по умолчанию случайный, но фиксируется в адресе */
function currentSeed(): number {
  const url = new URL(location.href);
  let s = url.searchParams.get('seed');
  if (!s) {
    s = Math.floor(Math.random() * 1e9).toString(36);
    url.searchParams.set('seed', s);
    history.replaceState(null, '', url.toString());
  }
  return hashSeed(s);
}

// ---------- Состояние приложения ----------

interface App {
  battleScene: BattleScene | null;
  hud: Hud | null;
  mode: 'menu' | 'battle';
}

const app: App = { battleScene: null, hud: null, mode: 'menu' };
// отладочный доступ (используется e2e-смоуком)
(window as unknown as { __app: App }).__app = app;

function buildSquad(): UnitState[] {
  return SQUAD.map((tpl, i) => makeUnit(tpl, 'pc_' + tpl.defId));
}

/** Бой 1: околица, отряд против шести упырей */
async function startOutskirtsBattle(): Promise<void> {
  await disposeBattle();
  const seed = currentSeed() ^ 0x9e3779b9;
  const def = mapDef('outskirts');
  const squad = buildSquad();
  // расстановка
  const { Grid } = await import('./game/grid');
  const grid = new Grid(def);
  const ps = grid.playerSpawns();
  squad.forEach((u, i) => {
    u.pos = { ...ps[i % ps.length] };
  });
  const es = grid.enemySpawns('1');
  const enemies: UnitState[] = es.map((cell, i) => {
    const tpl = i === es.length - 1 ? ENEMIES.ghul_brute : ENEMIES.ghul;
    const e = makeUnit(tpl, 'en_' + i);
    e.pos = { ...cell };
    return e;
  });
  const battle = Battle.create('outskirts', [...squad, ...enemies], seed);

  const hud = new Hud(uiRoot, {
    onOpenMenu: openPauseMenu,
    onOpenCharSheet: () => {
      /* М2: лист персонажа */
    },
  });
  const scene = new BattleScene(iso, battle, labels, {
    onHudRefresh: () => hud.refresh(),
    onBattleEnd: (result) => onBattleEnd(result),
    onMessage: (key) => hud.message(key),
    onEnemyHover: (u) => hud.showEnemyCard(u),
  });
  hud.attach(scene);
  app.battleScene = scene;
  app.hud = hud;
  app.mode = 'battle';

  const note = document.createElement('div');
  note.className = 'loading-note';
  note.textContent = '…отряд бредёт к Чернолесью';
  uiRoot.appendChild(note);
  await scene.init();
  note.remove();
  screens.hide();
  audio.startDrone();

  const events = battle.begin();
  await scene.playEvents(events);
  scene.refreshVisibility();
  scene.refreshOverlays();
  void scene.maybeRunAI();
}

async function disposeBattle(): Promise<void> {
  app.battleScene?.dispose();
  app.hud?.destroy();
  app.battleScene = null;
  app.hud = null;
}

function onBattleEnd(result: 'victory' | 'defeat'): void {
  const scene = app.battleScene;
  if (!scene) return;
  audio.sting(result === 'victory');
  const st = scene.battle.state;
  // лут: тела + сундуки карты (М1 — автосбор на экране итогов)
  let lootHtml = '';
  if (result === 'victory') {
    const items: string[] = [];
    items.push(`<span class="gi" style="--icon:url(${import.meta.env.BASE_URL}assets/icons/envelope.svg)"></span> ${t('item.abbot_letter')}`);
    for (const l of mapDef(st.mapId).loot ?? []) {
      for (const s of l.items) {
        const def = itemDef(s.id);
        items.push(`<span class="gi" style="--icon:url(${import.meta.env.BASE_URL}assets/icons/${def.icon}.svg)"></span> ${t(def.nameKey)}${s.count > 1 ? ' ×' + s.count : ''}`);
      }
    }
    lootHtml = items.join('<br>');
  }
  // травмы поднявшихся
  let injuriesHtml = '';
  const downed = st.units.filter((u) => u.side === 'player' && u.down);
  if (result === 'victory' && downed.length) {
    injuriesHtml = downed.map((u) => `${t(u.nameKey)} — <span class="neg">−1 ${t('stat.' + (u.injuries[u.injuries.length - 1]?.stat ?? 'str'))}</span>`).join('<br>');
  }
  setTimeout(() => {
    screens.battleResults({
      victory: result === 'victory',
      xp: st.xpAwarded,
      lootHtml,
      injuriesHtml,
      onContinue: () => showMainMenu(),
      onRestart: () => void startOutskirtsBattle(),
    });
  }, 900);
}

function openPauseMenu(): void {
  screens.pauseMenu({
    onResume: () => screens.hide(),
    onSave: () => {
      app.hud?.message('menu.saved');
      screens.hide();
    },
    onExport: () => screens.hide(),
    onRestart: () => {
      screens.hide();
      void startOutskirtsBattle();
    },
    onMenu: () => {
      void disposeBattle();
      showMainMenu();
    },
  });
}

function showMainMenu(): void {
  app.mode = 'menu';
  audio.stopDrone();
  screens.mainMenu({
    canContinue: false,
    onNew: () => void startOutskirtsBattle().catch((e) => console.error('battle boot failed', e)),
    onContinue: () => void 0,
    onCredits: () => screens.credits(() => showMainMenu()),
  });
}

// ---------- Ввод ----------

canvas.addEventListener('pointermove', (e) => {
  app.battleScene?.onPointerMove(e);
});
canvas.addEventListener('pointerdown', (e) => {
  if (screens.visible) return;
  if (e.button === 0) void app.battleScene?.onClick(e);
  else if (e.button === 2) app.battleScene?.onRightClick();
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
  if (app.mode !== 'battle') return;
  const scene = app.battleScene;
  if (!scene) return;
  switch (e.code) {
    case 'KeyQ':
      iso.rotate(1);
      break;
    case 'KeyE':
      iso.rotate(-1);
      break;
    case 'Space':
      e.preventDefault();
      if (!screens.visible) void scene.endTurnAction();
      break;
    case 'Tab':
      e.preventDefault();
      scene.cycleTarget();
      break;
    case 'Escape':
      if (screens.visible) screens.hide();
      else openPauseMenu();
      break;
    case 'Digit1':
    case 'Digit2':
    case 'Digit3':
    case 'Digit4': {
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
  if (app.mode === 'battle' && !screens.visible) {
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
  iso.render();
}
frame();

showMainMenu();
