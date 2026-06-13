import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
await p.goto('http://localhost:5199/?seed=m3shot');
await p.waitForTimeout(1200);
await p.click('text=Новая игра');
await p.waitForSelector('.dlg-option:not(.locked)', { timeout: 15000 });
await p.screenshot({ path: '/tmp/m3_intro.png' });
// прокликать интро и выиграть бой 1
for (const t of ['Войти в деревню','Войти в деревню','К оружию']) {
  await p.click(`.dlg-option:has-text("${t}")`); await p.waitForTimeout(500);
}
await p.waitForSelector('.loading-note', { state: 'detached', timeout: 90000 });
await p.waitForTimeout(1500);
await p.evaluate(() => {
  const sc = window.__app.battleScene;
  for (const u of sc.battle.state.units) if (u.side === 'enemy') sc.battle.applyDamage(u, 999, null, []);
  return sc.doAction({ type: 'pass' });
});
await p.waitForSelector('.result-screen', { timeout: 30000 });
await p.click('text=Дальше');
await p.waitForSelector('.camp-screen', { timeout: 10000 });
await p.click('text=В путь');
await p.waitForSelector('.explore-title', { timeout: 90000 });
await p.waitForTimeout(2500);
await p.screenshot({ path: '/tmp/m3_village.png' });
// подойти к старосте и диалог
await p.evaluate(() => {
  const pt = window.__project(7, 10);
  return window.__app.exploreScene.onClick({ clientX: pt.x, clientY: pt.y, button: 0 });
});
await p.waitForTimeout(3500);
await p.evaluate(() => {
  const pt = window.__project(7, 8);
  return window.__app.exploreScene.onClick({ clientX: pt.x, clientY: pt.y, button: 0 });
});
await p.waitForTimeout(2000);
await p.screenshot({ path: '/tmp/m3_dialogue.png' });
// к часовне → бой 2
while (await p.$('.dialogue-box')) {
  const opts = await p.$$('.dlg-option:not(.locked)');
  await opts[opts.length - 1].click(); await p.waitForTimeout(400);
}
for (let i = 0; i < 12; i++) {
  await p.evaluate(() => {
    const pt = window.__project(19, 7);
    const ex = window.__app.exploreScene;
    if (ex) return ex.onClick({ clientX: pt.x, clientY: pt.y, button: 0 });
  });
  await p.waitForTimeout(2500);
  if (await p.$('.dialogue-box')) break;
}
await p.click('.dlg-option:has-text("Довольно")');
await p.waitForSelector('.loading-note', { state: 'detached', timeout: 90000 });
await p.waitForTimeout(3000);
await p.screenshot({ path: '/tmp/m3_chapel.png' });
await b.close();
