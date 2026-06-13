// Баланс-проход: реальный бой 1 (ИИ против простого скриптового игрока),
// считаем раунды и время до победы. Критерий: бой ≤ ~15 минут.
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
p.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0,160)); });
p.on('pageerror', e => errors.push(String(e).slice(0,200)));
await p.goto('http://localhost:5199/?seed=balance');
await p.waitForTimeout(1200);
await p.click('text=Новая игра');
async function clickDlg(t){await p.waitForSelector('.dlg-option:not(.locked)',{timeout:15000});await p.click(`.dlg-option:has-text("${t}")`);await p.waitForTimeout(400);}
await clickDlg('Войти в деревню'); await clickDlg('Войти в деревню'); await clickDlg('К оружию');
await p.waitForSelector('.loading-note',{state:'detached',timeout:90000}); await p.waitForTimeout(1500);

// прогон боя: каждый активный игрок атакует ближайшего видимого врага, иначе идёт к нему, иначе пас
const t0 = Date.now();
const result = await p.evaluate(async () => {
  const sc = window.__app.battleScene;
  const b = sc.battle;
  function nearestEnemy(u){
    let best=null,bd=1e9;
    for(const e of b.state.units){if(e.side!=='enemy'||e.down)continue;const d=Math.abs(e.pos.x-u.pos.x)+Math.abs(e.pos.y-u.pos.y);if(d<bd){bd=d;best=e;}}
    return best;
  }
  let guard=400;
  while(!b.state.result && guard-->0){
    // дождаться, пока сцена не занята анимациями/ИИ
    if(sc.busy){await new Promise(r=>setTimeout(r,50));continue;}
    const u=b.activeUnit();
    if(!u){await new Promise(r=>setTimeout(r,50));continue;}
    if(u.side!=='player'){await new Promise(r=>setTimeout(r,50));continue;}
    const e=nearestEnemy(u);
    if(!e){await sc.doAction({type:'pass'});continue;}
    const w=b.unit(u.id).weaponId;
    // если можем атаковать — атакуем (учитывая AoE-оружие алхимика)
    const wd = sc.battle.hitPreview(u, e, 'light');
    if(!b.canAttack(u,e,'light')){await sc.doAction({type:'attack',target:e.id,mode:'light'});continue;}
    // иначе подойти к врагу в пределах хода
    const reach=b.reachableFor(u);
    let dest=null,bd=1e9;
    for(const [k] of reach){const [x,y]=k.split(',').map(Number);const d=Math.abs(x-e.pos.x)+Math.abs(y-e.pos.y);if(d<bd){bd=d;dest={x,y};}}
    if(dest && bd < (Math.abs(u.pos.x-e.pos.x)+Math.abs(u.pos.y-e.pos.y))){await sc.doAction({type:'move',to:dest});}
    else await sc.doAction({type:'pass'});
  }
  return { result:b.state.result, round:b.state.round, guard };
});
const secs = ((Date.now()-t0)/1000).toFixed(1);
console.log('battle1:', JSON.stringify(result), 'wall', secs+'s');
console.log('errors:', errors.length?errors.slice(0,6):'none');
await b.close();
