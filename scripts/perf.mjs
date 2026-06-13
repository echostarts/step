// Замер FPS на карте 48×32 (деревня) — критерий М4.
import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
p.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0,160)); });
p.on('pageerror', e => errors.push(String(e).slice(0,200)));
await p.goto('http://localhost:5199/?seed=perf');
await p.waitForTimeout(1200);
await p.click('text=Новая игра');
// проскочить интро и бой1 в деревню
async function clickDlg(t){ await p.waitForSelector('.dlg-option:not(.locked)',{timeout:15000}); await p.click(`.dlg-option:has-text("${t}")`); await p.waitForTimeout(500);}
await clickDlg('Войти в деревню'); await clickDlg('Войти в деревню'); await clickDlg('К оружию');
await p.waitForSelector('.loading-note',{state:'detached',timeout:90000}); await p.waitForTimeout(1500);
await p.evaluate(()=>{const sc=window.__app.battleScene;for(const u of sc.battle.state.units)if(u.side==='enemy')sc.battle.applyDamage(u,999,null,[]);return sc.doAction({type:'pass'});});
await p.waitForSelector('.result-screen',{timeout:30000}); await p.click('text=Дальше');
await p.waitForSelector('.camp-screen',{timeout:10000}); await p.click('text=В путь');
await p.waitForSelector('.explore-title',{timeout:90000}); await p.waitForTimeout(2000);
// замер кадров через rAF в странице (~4 секунды), с небольшим панорамированием
const fps = await p.evaluate(async () => {
  return await new Promise((resolve) => {
    const dts = [];
    let last = performance.now();
    let n = 0;
    function tick(){
      const now = performance.now();
      dts.push(now - last); last = now; n++;
      if (n < 240) requestAnimationFrame(tick);
      else {
        dts.sort((a,b)=>a-b);
        const avg = dts.reduce((s,v)=>s+v,0)/dts.length;
        const p95 = dts[Math.floor(dts.length*0.95)];
        resolve({ avgMs:+avg.toFixed(2), p95Ms:+p95.toFixed(2), fps:+(1000/avg).toFixed(1), frames:n });
      }
    }
    requestAnimationFrame(tick);
  });
});
const tiles = await p.evaluate(() => { const g = window.__app.exploreScene.grid; return g.w*g.h; });
const instanced = await p.evaluate(() => {
  let inst = 0; window.__app.exploreScene.mapView.group.traverse(o => { if (o.isInstancedMesh) inst++; });
  return inst;
});
console.log('map tiles:', tiles, '| instanced floor meshes:', instanced);
console.log('FPS:', JSON.stringify(fps));
console.log('errors:', errors.length ? errors.slice(0,6) : 'none');
await p.screenshot({ path: '/tmp/village48.png' });
await b.close();
