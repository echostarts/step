// М3-прогон: два принципиально разных пути — силой и словами.
import { chromium } from 'playwright';

async function winBattle(p) {
  await p.waitForSelector('.loading-note', { state: 'detached', timeout: 90000 });
  await p.waitForTimeout(1500);
  await p.evaluate(() => {
    const sc = window.__app.battleScene;
    for (const u of sc.battle.state.units) if (u.side === 'enemy') sc.battle.applyDamage(u, 999, null, []);
    return sc.doAction({ type: 'pass' });
  });
  await p.waitForSelector('.result-screen', { timeout: 30000 });
  await p.click('text=Дальше');
  await p.waitForTimeout(800);
}

async function clickDlg(p, text) {
  await p.waitForSelector('.dlg-option:not(.locked)', { timeout: 15000 });
  await p.click(`.dlg-option:has-text("${text}")`);
  await p.waitForTimeout(600);
}

// клик по клетке: синтетическое событие сквозь проекцию (цель может быть вне экрана)
async function clickCell(p, cx, cy) {
  await p.evaluate(([x, y]) => {
    const pt = window.__project(x, y);
    const ex = window.__app.exploreScene;
    if (ex) return ex.onClick({ clientX: pt.x, clientY: pt.y, button: 0 });
  }, [cx, cy]);
}

async function walkTo(p, cx, cy, tries = 10) {
  for (let i = 0; i < tries; i++) {
    await clickCell(p, cx, cy);
    await p.waitForTimeout(2800);
    const arrived = await p.evaluate(([x, y]) => {
      const c = window.__app.campaign;
      const l = c.squad[0].pos;
      return Math.abs(l.x - x) + Math.abs(l.y - y) <= 2;
    }, [cx, cy]);
    if (arrived) return true;
    if (await p.$('.dialogue-box')) return true; // диалог стартовал
  }
  return false;
}

async function run(label, viaWords) {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  p.on('pageerror', e => errors.push(String(e).slice(0,300)));
  await p.goto('http://localhost:5199/?seed=m3' + label);
  await p.waitForTimeout(1200);
  await p.click('text=Новая игра');
  await clickDlg(p, 'Войти в деревню');
  await clickDlg(p, 'Войти в деревню');
  await clickDlg(p, 'К оружию');
  await winBattle(p);
  await p.waitForSelector('.camp-screen', { timeout: 10000 });
  await p.click('text=В путь');
  await p.waitForSelector('.explore-title', { timeout: 90000 });
  await p.waitForTimeout(1500);
  console.log(label, '— деревня загружена');

  // поговорить со старостой (7,8): идём и кликаем по нему
  await walkTo(p, 7, 10);
  await clickCell(p, 7, 8);
  await p.waitForTimeout(1500);
  if (await p.$('.dialogue-box')) {
    console.log(label, '— староста говорит');
    // надавить волей, если доступно, иначе спросить
    const press = await p.$('.dlg-option:not(.locked):has-text("[Воля 6]")');
    if (press) { await press.click(); await p.waitForTimeout(400); }
    // выйти из диалога
    while (await p.$('.dialogue-box')) {
      const opts = await p.$$('.dlg-option:not(.locked)');
      if (!opts.length) break;
      await opts[opts.length - 1].click();
      await p.waitForTimeout(400);
    }
  }
  // к двери часовни
  await walkTo(p, 19, 8, 14);
  await clickCell(p, 19, 7);
  await p.waitForTimeout(2000);
  if (!(await p.$('.dialogue-box'))) {
    await clickCell(p, 19, 6);
    await p.waitForTimeout(2500);
  }
  const gotDlg = await p.$('.dialogue-box');
  console.log(label, '— диалог у часовни:', !!gotDlg);
  if (!gotDlg) {
    console.log(label, 'FAIL: позиция лидера', await p.evaluate(() => JSON.stringify(window.__app.campaign.squad[0].pos)));
    await p.screenshot({ path: '/tmp/m3fail_' + label + '.png' });
    await b.close();
    return;
  }

  if (viaWords) {
    await clickDlg(p, 'Предъявить его собственное письмо');
    await clickDlg(p, 'Войти следом');
    await clickDlg(p, 'Войти в деревню');
    await clickDlg(p, 'Оставить себе');
    await p.waitForSelector('.epilogue-box', { timeout: 15000 });
    console.log(label, '— эпилог:', (await p.textContent('.epilogue-box h2')).trim());
  } else {
    await clickDlg(p, 'Довольно. К оружию');
    await winBattle(p);
    await clickDlg(p, 'Войти в деревню');
    await clickDlg(p, 'Уничтожить её');
    await clickDlg(p, 'Закончить начатое');
    await winBattle(p);
    await p.waitForSelector('.epilogue-box', { timeout: 15000 });
    console.log(label, '— эпилог:', (await p.textContent('.epilogue-box h2')).trim());
  }
  console.log(label, '— errors:', errors.length ? errors.slice(0,6) : 'none');
  await p.screenshot({ path: '/tmp/m3_' + label + '_end.png' });
  await b.close();
}

await run('words', true);
await run('force', false);
