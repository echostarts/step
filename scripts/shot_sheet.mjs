import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
await p.goto('http://localhost:5199/?seed=m2test');
await p.waitForTimeout(1200);
await p.click('text=Новая игра');
await p.waitForSelector('.loading-note', { state: 'detached', timeout: 60000 });
await p.waitForTimeout(1000);
await p.evaluate(() => {
  const sc = window.__app.battleScene;
  for (const u of sc.battle.state.units) if (u.side === 'enemy') sc.battle.applyDamage(u, 999, null, []);
  return sc.doAction({ type: 'pass' });
});
await p.waitForSelector('.result-screen', { timeout: 20000 });
await p.click('text=Дальше');
await p.waitForSelector('.camp-screen', { timeout: 10000 });
await p.click('text=Отряд и снаряжение');
await p.waitForSelector('.sheet-box', { timeout: 5000 });
await p.waitForTimeout(500);
await p.screenshot({ path: '/tmp/shot_levelup.png' });
for (let i = 0; i < 4; i++) {
  if (await p.$('.levelup-box')) {
    await p.click('.levelup-stat');
    await p.click('.perk-card');
    await p.click('text=Принять');
    await p.waitForTimeout(300);
  } else break;
}
await p.waitForTimeout(600);
await p.screenshot({ path: '/tmp/shot_sheet.png' });
await b.close();
