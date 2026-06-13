import { expect, test, type Page } from '@playwright/test';

/**
 * Смоук-прохождение М4: грузится, бой стартует, ход совершается, сейв работает,
 * и виньетка добегает до эпилога. Консоль должна быть чистой.
 */

async function startGame(page: Page, errors: string[]): Promise<void> {
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?seed=smoke');
  await expect(page.locator('.game-title')).toHaveText('ОТРЕЧЁННЫЕ');
}

async function clickDlg(page: Page, text: string): Promise<void> {
  await page.waitForSelector('.dlg-option:not(.locked)', { timeout: 20000 });
  await page.click(`.dlg-option:has-text("${text}")`);
  await page.waitForTimeout(450);
}

async function winCurrentBattle(page: Page): Promise<void> {
  await page.waitForSelector('.loading-note', { state: 'detached', timeout: 90000 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const sc = (window as any).__app.battleScene;
    for (const u of sc.battle.state.units) if (u.side === 'enemy') sc.battle.applyDamage(u, 999, null, []);
    return sc.doAction({ type: 'pass' });
  });
  await page.waitForSelector('.result-screen', { timeout: 30000 });
}

test('грузится и показывает главное меню', async ({ page }) => {
  const errors: string[] = [];
  await startGame(page, errors);
  await expect(page.locator('text=Новая игра')).toBeVisible();
  expect(errors, errors.join('\n')).toEqual([]);
});

test('бой стартует и ход совершается', async ({ page }) => {
  const errors: string[] = [];
  await startGame(page, errors);
  await page.click('text=Новая игра');
  await clickDlg(page, 'Войти в деревню');
  await clickDlg(page, 'Войти в деревню');
  await clickDlg(page, 'К оружию');
  await page.waitForSelector('.loading-note', { state: 'detached', timeout: 90000 });
  await page.waitForTimeout(1500);

  // активный боец игрока ходит — ОД тратятся, позиция меняется
  const moved = await page.evaluate(async () => {
    const sc = (window as any).__app.battleScene;
    const u = sc.battle.activeUnit();
    const ap0 = u.ap;
    const reach = sc.battle.reachableFor(u);
    const k = [...reach.keys()][3];
    const [x, y] = k.split(',').map(Number);
    await sc.doAction({ type: 'move', to: { x, y } });
    const u2 = sc.battle.activeUnit();
    return { ap0, ap1: u2 ? u2.ap : -1, moved: u.pos.x === x && u.pos.y === y };
  });
  expect(moved.moved).toBe(true);
  expect(moved.ap1).toBeLessThan(moved.ap0);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('сейв и возобновление посреди боя', async ({ page }) => {
  const errors: string[] = [];
  await startGame(page, errors);
  await page.click('text=Новая игра');
  await clickDlg(page, 'Войти в деревню');
  await clickDlg(page, 'Войти в деревню');
  await clickDlg(page, 'К оружию');
  await page.waitForSelector('.loading-note', { state: 'detached', timeout: 90000 });
  await page.waitForTimeout(1500);

  const before = await page.evaluate(async () => {
    const sc = (window as any).__app.battleScene;
    const u = sc.battle.activeUnit();
    const reach = sc.battle.reachableFor(u);
    const k = [...reach.keys()][2];
    const [x, y] = k.split(',').map(Number);
    await sc.doAction({ type: 'move', to: { x, y } });
    const a = sc.battle.activeUnit();
    return { id: a.id, ap: a.ap, pos: a.pos };
  });
  // пауза → сохранить
  await page.keyboard.press('Escape');
  await page.click('text=Сохранить');
  await page.waitForTimeout(400);
  await page.reload();
  await page.click('text=Продолжить');
  await page.waitForSelector('.loading-note', { state: 'detached', timeout: 90000 });
  await page.waitForTimeout(1500);
  const after = await page.evaluate(() => {
    const sc = (window as any).__app.battleScene;
    const u = sc.battle.activeUnit();
    return { id: u.id, ap: u.ap, pos: u.pos };
  });
  expect(after).toEqual(before);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('виньетка добегает до эпилога (путь слов)', async ({ page }) => {
  // полный путь под софт-рендерингом долгий — даём запас
  test.setTimeout(300_000);
  const errors: string[] = [];
  await startGame(page, errors);
  await page.click('text=Новая игра');
  await clickDlg(page, 'Войти в деревню');
  await clickDlg(page, 'Войти в деревню');
  await clickDlg(page, 'К оружию');
  await winCurrentBattle(page); // бой 1 — после него в рюкзаке письмо настоятеля
  await page.click('text=Дальше');
  await page.waitForSelector('.camp-screen', { timeout: 10000 });
  await page.click('text=В путь');
  await page.waitForSelector('.explore-title', { timeout: 90000 });
  await page.waitForTimeout(1500);

  // подойти к двери часовни (триггер у клеток 23-24,9), кликая по проекции
  await page.evaluate(() => {
    (window as any).__app.campaign.squad[0].pos = { x: 23, y: 11 };
  });
  for (let i = 0; i < 12; i++) {
    await page.evaluate(() => {
      const pt = (window as any).__project(23, 9);
      return (window as any).__app.exploreScene?.onClick({ clientX: pt.x, clientY: pt.y, button: 0 });
    });
    await page.waitForTimeout(2200);
    if (await page.$('.dialogue-box')) break;
  }
  await expect(page.locator('.dialogue-box')).toBeVisible();
  // путь слов: письмо отменяет Бой 2 целиком
  await clickDlg(page, 'Предъявить его собственное письмо');
  await clickDlg(page, 'Войти следом'); // -> диалог реликвии
  await clickDlg(page, 'Войти в деревню'); // реликвия n1 -> n2
  await clickDlg(page, 'Оставить себе'); // -> эпилог «Ноша»
  await expect(page.locator('.epilogue-box h2')).toBeVisible();
  expect(errors, errors.join('\n')).toEqual([]);
});
