import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
async function clickDlg(t){await p.waitForSelector('.dlg-option:not(.locked)',{timeout:15000});await p.click(`.dlg-option:has-text("${t}")`);await p.waitForTimeout(450);}
async function win(){await p.waitForSelector('.loading-note',{state:'detached',timeout:90000});await p.waitForTimeout(1200);await p.evaluate(()=>{const sc=window.__app.battleScene;for(const u of sc.battle.state.units)if(u.side==='enemy')sc.battle.applyDamage(u,999,null,[]);return sc.doAction({type:'pass'});});await p.waitForSelector('.result-screen',{timeout:30000});}
// Титры
await p.goto('http://localhost:5199/?seed=m4');
await p.waitForTimeout(1200);
await p.click('text=Титры');
await p.waitForSelector('.credits-screen',{timeout:5000});
await p.waitForTimeout(400);
await p.screenshot({ path:'/tmp/m4_credits.png' });
await p.click('text=Назад');
// Полный путь слов до эпилога
await p.click('text=Новая игра');
await clickDlg('Войти в деревню'); await clickDlg('Войти в деревню'); await clickDlg('К оружию');
await win(); await p.click('text=Дальше');
await p.waitForSelector('.camp-screen',{timeout:10000}); await p.click('text=В путь');
await p.waitForSelector('.explore-title',{timeout:90000}); await p.waitForTimeout(1500);
await p.evaluate(()=>{window.__app.campaign.squad[0].pos={x:23,y:11};});
for(let i=0;i<12;i++){try{await p.evaluate(()=>{const pt=window.__project(23,9);const ex=window.__app.exploreScene;if(ex)ex.onClick({clientX:pt.x,clientY:pt.y,button:0});});}catch(e){}await p.waitForTimeout(2200);if(await p.$('.dialogue-box'))break;}
await p.screenshot({ path:'/tmp/m4_abbot.png' });
await clickDlg('Предъявить его собственное письмо');
await clickDlg('Войти следом');
await clickDlg('Войти в деревню');
await clickDlg('Оставить себе');
await p.waitForSelector('.epilogue-box',{timeout:15000});
await p.waitForTimeout(400);
await p.screenshot({ path:'/tmp/m4_epilogue.png' });
await b.close();
