// Скриншоты для проверки картинки: меню и бой.
import { chromium } from 'playwright';

const url = process.env.URL ?? 'http://localhost:5199/?seed=chern';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(url);
await page.waitForTimeout(1500);
await page.screenshot({ path: '/tmp/shot_menu.png' });
await page.click('text=Новая игра');
await page.waitForSelector('.loading-note', { state: 'detached', timeout: 60000 });
await page.waitForTimeout(3000);
await page.screenshot({ path: '/tmp/shot_battle.png' });
await page.mouse.move(700, 520);
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/shot_hover.png' });
console.log('pageerrors:', errors.length ? errors : 'none');
await browser.close();
