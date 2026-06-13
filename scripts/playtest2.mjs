// Полный раунд: игроки пасуют, ИИ ходит, раунд 2 наступает.
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
  return { active: u?.id, busy: sc.busy, round: sc.battle.state.round, result: sc.battle.state.result,
    enemies: sc.battle.state.units.filter(x=>x.side==='enemy').map(x=>({id:x.id,pos:x.pos,hp:x.hp})) };
});
const s0 = await state();
for (let r = 0; r < 3; r++) {
  for (let i = 0; i < 8; i++) {
    const s = await state();
    if (s.result) break;
    if (!s.busy && s.active?.startsWith('pc_')) { await p.keyboard.press('Space'); }
    await p.waitForTimeout(1200);
  }
  // ждём конца ходов ИИ
  for (let i = 0; i < 90; i++) {
    const s = await state();
    if (!s.busy && (s.active?.startsWith('pc_') || s.result)) break;
    await p.waitForTimeout(1000);
  }
  const s = await state();
  console.log('round', s.round, 'active', s.active, 'result', s.result);
  if (s.result) break;
}
const s1 = await state();
const movedEnemies = s1.enemies.filter((e,i) => JSON.stringify(e.pos) !== JSON.stringify(s0.enemies[i].pos)).length;
console.log('enemies moved:', movedEnemies, 'of', s1.enemies.length);
console.log('squad hp:', await p.evaluate(() => window.__app.battleScene.battle.state.units.filter(u=>u.side==='player').map(u=>u.hp)));
await p.screenshot({ path: '/tmp/shot_round3.png' });
console.log('errors:', errors.length ? errors.slice(0,8) : 'none');
await b.close();
