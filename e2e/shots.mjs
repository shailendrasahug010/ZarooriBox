import { chromium } from 'playwright-core';
const base = process.env.BASE ?? 'http://localhost:4173';
const out = 'e2e/screenshots';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const errors = [];
for (const [name, vp] of [['desktop', { width: 1366, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, isMobile: name === 'mobile', hasTouch: name === 'mobile' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${name} console: ${m.text()}`));
  await page.goto(base + '/');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/${name}-landing.png`, fullPage: name === 'desktop' });
  await page.goto(base + '/login');
  await page.getByRole('button', { name: /Try the demo/ }).click();
  await page.waitForURL('**/app');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/${name}-dashboard.png`, fullPage: true });
  for (const p of (process.env.PAGES ?? 'upcoming,expiry,shopping,people,home-maintenance,calendar,settings,lists,add').split(',')) {
    await page.goto(`${base}/app/${p}`);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${out}/${name}-${p}.png`, fullPage: true });
  }
  await ctx.close();
}
await browser.close();
console.log(errors.length ? errors.join('\n') : 'no errors');
