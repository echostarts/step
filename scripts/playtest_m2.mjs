// М2-прогон: победа → лут/опыт → лагерь → левел-ап → смена оружия → сейв/лоад.
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
p.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0,200)); });
p.on('pageerror', e => errors.push(String(e).slice(0,300)));
await p.goto('http://localhost:5199/?seed=m2test');
await p.waitForTimeout(1200);
await p.click('text=Новая игра');
await p.waitForSelector('.loading-note', { state: 'detached', timeout: 60000 });
await p.waitForTimeout(1500);

// мгновенная победа
await p.evaluate(() => {
  const sc = window.__app.battleScene;
  const b = sc.battle;
  for (const u of b.state.units) if (u.side === 'enemy') b.applyDamage(u, 999, null, []);
  return sc.doAction({ type: 'pass' });
});
await p.waitForSelector('.result-screen', { timeout: 20000 });
const xpText = await p.textContent('.result-xp');
console.log('xp:', xpText.trim());
console.log('loot:', (await p.textContent('.result-loot').catch(()=>'-')).trim().slice(0,120));
await p.click('text=Дальше');
await p.waitForSelector('.camp-screen', { timeout: 10000 });
console.log('camp ok');

// лист персонажа и левел-ап
await p.click('text=Отряд и снаряжение');
await p.waitForSelector('.sheet-box', { timeout: 5000 });
const hasLevelup = await p.$('.levelup-box');
console.log('levelup screen:', !!hasLevelup);
if (hasLevelup) {
  await p.click('.levelup-stat'); // первый стат
  await p.click('.perk-card');    // первый перк
  await p.click('text=Принять');
  await p.waitForTimeout(300);
  console.log('levelup applied:', await p.evaluate(() => {
    const u = window.__app.campaign.squad[0];
    return JSON.stringify({ level: u.level, perks: u.perks, stats: u.stats });
  }));
}
// смена оружия у Колодника: снять запасной тесак, надеть из рюкзака
await p.click('.sheet-tab >> text=Колодник');
await p.waitForTimeout(200);
// пропускаем его левел-ап, если есть
if (await p.$('.levelup-box')) {
  await p.click('.levelup-stat');
  await p.click('.perk-card');
  await p.click('text=Принять');
  await p.waitForTimeout(300);
}
const before = await p.evaluate(() => {
  const u = window.__app.campaign.squad.find(x=>x.defId==='kolodnik');
  return { weapon: u.weaponId, spare: u.spareWeaponId };
});
// снять запасное в рюкзак
await p.click('.equip-slot:nth-of-type(2) .slot-item.clickable');
await p.waitForTimeout(200);
// надеть из рюкзака (кнопка Экипировать у тесака)
await p.evaluate(() => {
  const rows = [...document.querySelectorAll('.bp-item')];
  const row = rows.find(r => r.textContent.includes('Тесак'));
  row.querySelector('.bp-equip').click();
});
await p.waitForTimeout(200);
const after = await p.evaluate(() => {
  const u = window.__app.campaign.squad.find(x=>x.defId==='kolodnik');
  return { weapon: u.weaponId, spare: u.spareWeaponId };
});
console.log('weapon before:', JSON.stringify(before), 'after:', JSON.stringify(after));

// сейв/лоад: перезагрузка страницы → Продолжить → лагерь
await p.reload();
await p.waitForTimeout(1500);
const canContinue = await p.$('text=Продолжить');
console.log('continue visible:', !!canContinue);
await p.click('text=Продолжить');
await p.waitForSelector('.camp-screen', { timeout: 10000 });
const restored = await p.evaluate(() => {
  const u = window.__app.campaign.squad.find(x=>x.defId==='kolodnik');
  return { weapon: u.weaponId, level: u.level };
});
console.log('restored:', JSON.stringify(restored));
console.log('errors:', errors.length ? errors.slice(0,8) : 'none');
await b.close();
