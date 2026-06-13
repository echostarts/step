import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
await p.goto('http://localhost:5199/?seed=chern');
await p.waitForTimeout(1200);
await p.click('text=Новая игра');
await p.waitForSelector('.loading-note', { state: 'detached', timeout: 60000 });
await p.waitForTimeout(2500);
// зум колесом
for (let i = 0; i < 4; i++) { await p.mouse.wheel(0, -120); await p.waitForTimeout(120); }
await p.waitForTimeout(1200);
await p.screenshot({ path: '/tmp/shot_close.png' });
// портрет
const img = await p.evaluate(() => document.querySelector('.portrait img')?.src?.slice(0, 100000));
if (img) {
  const fs = await import('fs');
  fs.writeFileSync('/tmp/portrait.png', Buffer.from(img.split(',')[1], 'base64'));
}
await b.close();
