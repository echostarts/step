// Сейв посреди боя → перезагрузка → возобновление.
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
p.on('pageerror', e => errors.push(String(e).slice(0,300)));
await p.goto('http://localhost:5199/?seed=m2save');
await p.waitForTimeout(1200);
await p.click('text=Новая игра');
await p.waitForSelector('.loading-note', { state: 'detached', timeout: 60000 });
await p.waitForTimeout(1500);
// подвигаемся и потратим ОД
const st0 = await p.evaluate(() => {
  const sc = window.__app.battleScene;
  const u = sc.battle.activeUnit();
  const reach = sc.battle.reachableFor(u);
  const k = [...reach.keys()][5];
  const [x, y] = k.split(',').map(Number);
  return sc.doAction({ type: 'move', to: { x, y } }).then(() => {
    const u2 = sc.battle.activeUnit();
    return { id: u2.id, ap: u2.ap, pos: u2.pos, round: sc.battle.state.round };
  });
});
console.log('mid-battle state:', JSON.stringify(st0));
await p.waitForTimeout(2500);
// сохранить через паузу
await p.keyboard.press('Escape');
await p.click('text=Сохранить');
await p.waitForTimeout(400);
await p.reload();
await p.waitForTimeout(1500);
await p.click('text=Продолжить');
await p.waitForSelector('.loading-note', { state: 'detached', timeout: 60000 });
await p.waitForTimeout(2000);
const st1 = await p.evaluate(() => {
  const sc = window.__app.battleScene;
  const u = sc.battle.activeUnit();
  return { id: u.id, ap: u.ap, pos: u.pos, round: sc.battle.state.round,
    explored: sc.fog.explored.size > 50 };
});
console.log('resumed state:', JSON.stringify(st1));
console.log('match:', st0.id === st1.id && st0.ap === st1.ap && JSON.stringify(st0.pos) === JSON.stringify(st1.pos));
console.log('errors:', errors.length ? errors.slice(0,8) : 'none');
await b.close();
