// Игровой прогон: ход, атака, ход ИИ — без ошибок в консоли.
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
p.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0,200)); });
p.on('pageerror', e => errors.push(String(e).slice(0,300)));
await p.goto('http://localhost:5199/?seed=chern');
await p.waitForTimeout(1200);
await p.click('text=Новая игра');
await p.waitForSelector('.loading-note', { state: 'detached', timeout: 60000 });
await p.waitForTimeout(2000);

const state = () => p.evaluate(() => {
  const sc = window.__app.battleScene;
  const u = sc.battle.activeUnit();
  return { active: u?.id, ap: u?.ap, pos: u?.pos, busy: sc.busy, round: sc.battle.state.round, result: sc.battle.state.result };
});
console.log('start:', JSON.stringify(await state()));

// двигаем активного юнита программно через клик по экранной проекции клетки
const moved = await p.evaluate(() => {
  const sc = window.__app.battleScene;
  const u = sc.battle.activeUnit();
  const from = { ...u.pos };
  const reach = sc.battle.reachableFor(u);
  // берём клетку подальше к северо-востоку
  let best = null, bd = -1;
  for (const [k] of reach) {
    const [x, y] = k.split(',').map(Number);
    const d = (x - u.pos.x) - (y - u.pos.y);
    if (d > bd) { bd = d; best = { x, y }; }
  }
  return sc.doAction({ type: 'move', to: best }).then(() => {
    const u2 = sc.battle.activeUnit();
    return { from, to: best, now: u2?.pos ?? null, ap: u2?.ap };
  });
});
console.log('move:', JSON.stringify(moved));
await p.waitForTimeout(4000);
// пасуем — очередь дойдёт до ИИ
await p.keyboard.press('Space');
await p.waitForTimeout(1500);
console.log('after pass:', JSON.stringify(await state()));
// ждём пока ИИ отходит (до 60с)
for (let i = 0; i < 60; i++) {
  const s = await state();
  if (!s.busy && s.active?.startsWith('pc_')) break;
  await p.waitForTimeout(1000);
}
console.log('after AI:', JSON.stringify(await state()));
await p.screenshot({ path: '/tmp/shot_ai.png' });
console.log('errors:', errors.length ? errors.slice(0,8) : 'none');
await b.close();
