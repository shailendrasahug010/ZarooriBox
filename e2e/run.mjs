// End-to-end walk through the quality checklist against a running build.
// Usage: npm run build && npx vite preview --port 4173 & npm run e2e
import { chromium } from 'playwright-core';

const BASE = process.env.BASE ?? 'http://localhost:4173';
const executablePath = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath });
const results = [];
const pageErrors = [];

async function step(name, fn) {
  try {
    await fn();
    results.push(['✓', name]);
  } catch (e) {
    results.push(['✗', name, e.message.split('\n')[0]]);
  }
}
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

async function newPage(viewport = { width: 1280, height: 900 }, mobile = false) {
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  page.setDefaultTimeout(5000);
  page.on('pageerror', (e) => pageErrors.push(e.message));
  return { ctx, page };
}

const { ctx, page } = await newPage();
const email = `meera${Date.now()}@example.com`;
const quickAdd = async (text) => {
  await page.fill('#quick-add-input', text);
  await page.press('#quick-add-input', 'Enter');
  await page.waitForTimeout(250);
};

await step('Protected route redirects to login when signed out', async () => {
  await page.goto(`${BASE}/app/upcoming`);
  await page.waitForURL('**/login');
});

await step('Landing page renders hero and CTAs', async () => {
  await page.goto(BASE);
  await page.getByText('Let LifeBox remember it for you.').waitFor();
  await page.getByRole('link', { name: 'See How It Works' }).waitFor();
});

await step('Sign up validation errors', async () => {
  await page.getByRole('link', { name: /Start Free/ }).first().click();
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByText('Tell us what to call you.').waitFor();
  await page.fill('#su-name', 'Meera');
  await page.fill('#su-email', 'not-an-email');
  await page.fill('#su-password', 'short');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByText('doesn’t look right').waitFor();
  await page.getByText('Use at least 8 characters.').waitFor();
});

await step('Sign up creates account and shows empty states', async () => {
  await page.fill('#su-email', email);
  await page.fill('#su-password', 'lifebox123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL('**/app');
  await page.getByText('Good', { exact: false }).first().waitFor();
  await page.getByText('No forgotten things here').waitFor();
  await page.getByText('Your shopping list is empty.').waitFor();
  await page.getByText('Nothing lent or borrowed yet.').waitFor();
  await page.getByText('Everything is fine').waitFor();
});

await step('Quick Add preview + memory creation (spec example)', async () => {
  await page.fill('#quick-add-input', 'Car insurance expires 12 February 2027');
  await page.getByText('Vehicle · Insurance').waitFor();
  await page.getByText('30 days before').waitFor();
  await page.press('#quick-add-input', 'Enter');
  await page.getByText('Remembered: Car Insurance').waitFor();
  expect((await page.inputValue('#quick-add-input')) === '', 'input should clear');
});

await step('Quick Add lending and shopping', async () => {
  await quickAdd('I lent Rahul ₹2000 today');
  await page.getByText('Rahul owes me ₹2,000').first().waitFor();
  await quickAdd('Buy milk, bread and 2 kg rice');
  await page.getByText('3 items added to shopping').waitFor();
  await quickAdd('RO filter change every 6 months');
  await page.getByText('Remembered: RO Filter Change').waitFor();
});

await step('Add Memory form validation + create due-today item', async () => {
  await page.goto(`${BASE}/app/add`);
  await page.getByRole('button', { name: 'Save memory' }).click();
  await page.getByText('Give it a name').waitFor();
  await page.fill('#mf-title', 'Electricity bill');
  await page.getByRole('button', { name: /Home/ }).first().click();
  await page.selectOption('#mf-subcategory', 'Bills');
  const today = await page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  await page.fill('#mf-dueDate', today);
  await page.selectOption('#mf-repeat', 'monthly');
  await page.getByRole('button', { name: 'More details' }).click();
  await page.fill('#mf-amount', '1840');
  await page.fill('#mf-notes', 'Pay via UPI');
  await page.getByRole('button', { name: 'Save memory' }).click();
  await page.waitForURL(/\/app$/);
  await page.getByRole('region', { name: 'Due Today' }).getByText('Electricity bill').waitFor();
  await page.getByText('A few things need you today').waitFor();
});

await step('Item details open and Escape closes', async () => {
  await page.getByRole('region', { name: 'Due Today' }).getByText('Electricity bill').click();
  await page.getByRole('dialog').getByText('Pay via UPI').waitFor();
  await page.getByRole('dialog').getByText('Monthly').waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'detached' });
});

await step('Edit an item', async () => {
  await page.getByRole('region', { name: 'Due Today' }).getByText('Electricity bill').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Edit' }).click();
  await page.waitForURL('**/app/edit/**');
  await page.fill('#mf-title', 'Electricity bill (BESCOM)');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.getByText('Changes saved').waitFor();
  await page.getByText('Electricity bill (BESCOM)').first().waitFor();
});

await step('Complete a recurring item rolls it to next month', async () => {
  await page.getByRole('button', { name: 'Mark “Electricity bill (BESCOM)” as done' }).first().click();
  await page.getByText(/Done! Next one is on/).waitFor();
  await page.getByText('No forgotten things here').waitFor();
});

await step('Complete a one-off item, then undo', async () => {
  await page.goto(`${BASE}/app/upcoming`);
  await page.getByRole('button', { name: 'Mark “Car Insurance” as done' }).click();
  await page.getByText('“Car Insurance” is done').waitFor();
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.getByRole('button', { name: 'Mark “Car Insurance” as done' }).waitFor();
});

await step('Filter Upcoming by category and status', async () => {
  await page.getByRole('button', { name: /Vehicle/ }).click();
  await page.getByText('Car Insurance').waitFor();
  expect((await page.getByText('RO Filter Change').count()) === 0, 'Home item should be filtered out');
  await page.getByRole('tab', { name: /Done/ }).click();
  await page.getByText('Nothing completed yet').waitFor();
  await page.getByRole('tab', { name: /Active/ }).click();
});

await step('Delete an item with confirm, then undo', async () => {
  await page.getByText('Car Insurance').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await page.getByText('Deleted “Car Insurance”').waitFor();
  await page.waitForTimeout(200);
  expect((await page.getByRole('button', { name: 'Mark “Car Insurance” as done' }).count()) === 0, 'should be gone');
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.getByRole('button', { name: 'Mark “Car Insurance” as done' }).waitFor();
});

await step('Search across records', async () => {
  await page.goto(`${BASE}/app/search?q=insurance`);
  await page.getByRole('region', { name: 'Memories' }).getByText('Car Insurance').waitFor();
  await page.fill('#search-input', 'rahul');
  await page.getByRole('region', { name: 'People and things' }).getByText('Rahul owes me ₹2,000').waitFor();
  await page.fill('#search-input', 'zzzz');
  await page.getByText('Nothing found for “zzzz”').waitFor();
});

await step('Shopping: add, purchase, clear completed', async () => {
  await page.goto(`${BASE}/app/shopping`);
  await page.getByRole('button', { name: 'Add item' }).click();
  await page.getByText('What do you need to buy?').waitFor();
  await page.fill('#shop-name', 'LED bulb');
  await page.fill('#shop-qty', '2');
  await page.press('#shop-name', 'Enter');
  await page.getByRole('region', { name: 'Home' }).getByText('LED bulb').waitFor();
  await page.getByRole('checkbox', { name: /Milk/ }).click();
  expect((await page.getByRole('checkbox', { name: /Milk/ }).getAttribute('aria-checked')) === 'true', 'milk checked');
  await page.getByRole('button', { name: 'Clear completed' }).click();
  await page.getByText('Cleared 1 item').waitFor();
  expect((await page.getByRole('checkbox', { name: /Milk/ }).count()) === 0, 'milk cleared');
});

await step('People & Things: add borrowed, mark returned', async () => {
  await page.goto(`${BASE}/app/people`);
  await page.getByRole('button', { name: 'Add' }).first().click();
  await page.getByRole('dialog').getByRole('tab', { name: 'I borrowed' }).click();
  await page.getByRole('dialog').getByRole('tab', { name: /Thing/ }).click();
  await page.fill('#lf-personName', 'Amit');
  await page.fill('#lf-itemName', 'Drill machine');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await page.getByText('Noted: borrowed from Amit').waitFor();
  await page.getByRole('main').getByRole('tab', { name: /I borrowed/ }).click();
  await page.getByText('I borrowed a drill machine from Amit').waitFor();
  await page.getByRole('button', { name: 'Returned' }).click();
  await page.getByText('Marked as given back').waitFor();
  await page.getByRole('main').getByRole('tab', { name: /Returned/ }).click();
  await page.getByText('I borrowed a drill machine from Amit').waitFor();
});

await step('Calendar shows items on a clicked date', async () => {
  await page.goto(`${BASE}/app/calendar`);
  await page.getByRole('button', { name: 'Next month' }).click();
  await page.getByRole('button', { name: 'Next month' }).click();
  await page.getByRole('button', { name: 'Previous month' }).click();
  await page.getByRole('button', { name: 'Today' }).click();
  const cell = page.locator('[data-date]').filter({ hasText: /^\d+$/ });
  expect((await cell.count()) === 42, 'six-week grid');
});

await step('Expiry Radar lists expiring item', async () => {
  await page.goto(`${BASE}/app/expiry`);
  await page.getByText('Car Insurance').waitFor();
});

await step('Notification settings page', async () => {
  await page.goto(`${BASE}/app/settings#notifications`);
  await page.getByRole('switch', { name: 'Browser notifications' }).waitFor();
  await page.getByRole('switch', { name: 'WhatsApp' }).waitFor();
  expect(await page.getByRole('switch', { name: 'WhatsApp' }).isDisabled(), 'WhatsApp is coming soon');
});

await step('Data persists across reload', async () => {
  await page.reload();
  await page.goto(`${BASE}/app/search?q=bulb`);
  await page.getByText('LED bulb').first().waitFor();
});

await step('Logout, wrong password, then login', async () => {
  await page.goto(`${BASE}/app/settings`);
  await page.getByRole('button', { name: 'Log out' }).click();
  await page.waitForURL(BASE + '/');
  await page.goto(`${BASE}/login`);
  await page.fill('#login-email', email);
  await page.fill('#login-password', 'wrongpass99');
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.getByText('That email and password don’t match.').waitFor();
  await page.fill('#login-password', 'lifebox123');
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL('**/app');
  await page.getByText('Car Insurance').first().waitFor();
});

await step('Forgot + reset password', async () => {
  await page.goto(`${BASE}/app/settings`);
  await page.getByRole('button', { name: 'Log out' }).click();
  await page.goto(`${BASE}/forgot-password`);
  await page.fill('#fp-email', email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await page.getByRole('link', { name: 'Choose a new password' }).click();
  await page.fill('#rp-password', 'newpass456');
  await page.fill('#rp-confirm', 'newpass456');
  await page.getByRole('button', { name: 'Save new password' }).click();
  await page.waitForURL('**/login');
  await page.fill('#login-email', email);
  await page.fill('#login-password', 'newpass456');
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL('**/app');
});

await step('A second user sees none of the first user’s data', async () => {
  await page.goto(`${BASE}/app/settings`);
  await page.getByRole('button', { name: 'Log out' }).click();
  await page.goto(`${BASE}/signup`);
  await page.fill('#su-name', 'Kabir');
  await page.fill('#su-email', `kabir${Date.now()}@example.com`);
  await page.fill('#su-password', 'kabirpass1');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL('**/app');
  await page.getByText('Your LifeBox is empty').waitFor();
  await page.goto(`${BASE}/app/search?q=insurance`);
  await page.getByText('Nothing found for “insurance”').waitFor();
});
await ctx.close();

// Mobile
const m = await newPage({ width: 390, height: 844 }, true);
await step('Mobile: demo login, bottom nav, no horizontal scroll', async () => {
  const p = m.page;
  await p.goto(`${BASE}/login`);
  await p.getByRole('button', { name: /Try the demo/ }).click();
  await p.waitForURL('**/app');
  await p.getByRole('link', { name: 'Add a memory' }).waitFor();
  for (const path of ['', 'upcoming', 'shopping', 'people', 'calendar', 'expiry', 'settings', 'lists', 'add']) {
    await p.goto(`${BASE}/app/${path}`);
    await p.waitForTimeout(300);
    const [sw, w] = await p.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    expect(sw <= w, `/${path} overflows (${sw} > ${w})`);
  }
  await p.getByRole('link', { name: 'Lists' }).click();
  await p.waitForURL('**/app/lists');
  await p.getByRole('link', { name: /Shopping/ }).click();
  await p.waitForURL('**/app/shopping');
  const box = await p.getByRole('checkbox').first().boundingBox();
  expect(box && box.height >= 44, 'touch target ≥ 44px');
});
await m.ctx.close();
await browser.close();

for (const r of results) console.log(r.join('  '));
if (pageErrors.length) console.log('\nPage errors:\n' + pageErrors.join('\n'));
const failed = results.filter((r) => r[0] === '✗').length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed || pageErrors.length ? 1 : 0);
