import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0,300)));
await p.goto('http://localhost:5199/?seed=chern');
await p.waitForTimeout(1200);
await p.click('text=Новая игра');
await p.waitForSelector('.loading-note', { state: 'detached', timeout: 60000 });
await p.waitForTimeout(2500);
const info = await p.evaluate(() => {
  const app = window.__app;
  const sc = app.battleScene;
  const b = sc.battle;
  const u = b.activeUnit();
  return {
    busy: sc.busy,
    isPlayerTurn: sc.isPlayerTurn,
    active: u && { id: u.id, ap: u.ap, pos: u.pos, side: u.side },
    turnIdx: b.state.turnIdx,
    order: b.state.order,
    round: b.state.round,
    reach: u ? sc.battle.reachableFor(u).size : -1,
    overlayChildren: sc.overlay.group.children.length,
  };
});
console.log(JSON.stringify(info, null, 1));
await b.close();
