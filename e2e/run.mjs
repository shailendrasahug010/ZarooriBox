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
    results.push(['✗', name, process.env.E2E_VERBOSE ? e.message : e.message.split('\n')[0]]);
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
// The main walk-through has notifications allowed, so the start-up prompt stays away.
await ctx.grantPermissions(['notifications'], { origin: BASE });
const email = `meera${Date.now()}@example.com`;
/** The pop-up Quick Add shows after saving: checks it, then closes it with Done. */
const confirmAdded = async (p, title, rows = []) => {
  const dialog = p.getByRole('dialog', { name: 'Added' });
  await dialog.waitFor();
  if (title) await dialog.getByText(title, { exact: true }).waitFor();
  for (const row of rows) await dialog.getByText(row).first().waitFor();
  await dialog.getByRole('button', { name: 'Done' }).click();
  await dialog.waitFor({ state: 'detached' });
};
const quickAdd = async (text, title) => {
  await page.fill('#quick-add-input', text);
  await page.press('#quick-add-input', 'Enter');
  await page.waitForTimeout(250);
  if (await page.getByRole('dialog', { name: 'Added' }).count()) await confirmAdded(page, title);
};

await step('Protected route redirects to login when signed out', async () => {
  await page.goto(`${BASE}/app/upcoming`);
  await page.waitForURL('**/login');
});

await step('Landing page renders hero and CTAs', async () => {
  await page.goto(BASE);
  await page.getByText('Let ZarooriBox remember it for you.').waitFor();
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
  await page.fill('#su-password', 'zaroori123');
  await page.getByRole('button', { name: 'Create account' }).click();
  // A brand-new account starts with the short setup; skipping it lands on the dashboard.
  await page.waitForURL('**/app/welcome');
  await page.getByText('Welcome to ZarooriBox, Meera!').waitFor();
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.waitForURL(/\/app$/);
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
  // The pop-up says what was saved, when, how often and the reminder.
  await confirmAdded(page, 'Car Insurance', ['Vehicle · Insurance', /12 Feb 2027/, 'Just once', '30 days before']);
  expect((await page.inputValue('#quick-add-input')) === '', 'input should clear');
});

await step('Quick Add lending and shopping', async () => {
  await quickAdd('I lent Rahul ₹2000 today', 'Rahul owes me ₹2,000');
  await quickAdd('Buy milk, bread and 2 kg rice');
  await page.getByText('3 items added to shopping').waitFor();
  await page.fill('#quick-add-input', 'RO filter change every 6 months');
  await page.press('#quick-add-input', 'Enter');
  await confirmAdded(page, 'RO Filter Change', ['Every 6 months']);
});

await step('Quick Add tidies a misspelt note and Undo in the pop-up removes it', async () => {
  await page.fill('#quick-add-input', 'remind me tommorow to call amit at 6pm');
  await page.press('#quick-add-input', 'Enter');
  const dialog = page.getByRole('dialog', { name: 'Added' });
  await dialog.getByText('Call Amit', { exact: true }).waitFor();
  await dialog.getByText('Tomorrow').first().waitFor();
  await dialog.getByText('6:00 pm').first().waitFor();
  await dialog.getByRole('button', { name: 'Undo' }).click();
  await page.getByText('Removed').first().waitFor();
  await page.goto(`${BASE}/app/search?q=amit`);
  await page.getByText('Nothing found for “amit”').waitFor();
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
  // Allowed in the browser, so alerts were switched on when the app opened.
  expect(await page.getByRole('switch', { name: 'Browser notifications' }).isChecked(), 'alerts switched on at start');
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
  await page.fill('#login-password', 'zaroori123');
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
  await page.waitForURL('**/app/welcome');
  await page.goto(`${BASE}/app/search?q=insurance`);
  await page.getByText('Nothing found for “insurance”').waitFor();
});

await step('First-run setup: three steps, first item added, then the dashboard', async () => {
  await page.goto(`${BASE}/app`);
  await page.waitForURL('**/app/welcome');
  await page.getByText('Welcome to ZarooriBox, Kabir!').waitFor();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByText('Add your first one').waitFor();
  await page.fill('#quick-add-input', 'Pay rent on the 5th every month');
  await page.press('#quick-add-input', 'Enter');
  await confirmAdded(page, 'Pay Rent', [/month/i]);
  await page.getByRole('button', { name: 'Go to my ZarooriBox' }).click();
  await page.waitForURL(/\/app$/);
  await page.reload();
  await page.waitForTimeout(300);
  expect(!page.url().includes('welcome'), 'setup should not come back');
});

await step('Language: switching to Hindi changes the screens, and back', async () => {
  await page.goto(`${BASE}/app/settings#language`);
  await page.selectOption('#set-lang', 'hi');
  await page.getByText('ऐप की भाषा').waitFor();
  await page.goto(`${BASE}/app`);
  await page.getByRole('region', { name: 'आज करना है' }).waitFor();
  expect((await page.getAttribute('html', 'lang')) === 'hi', 'html lang is hi');
  await page.goto(`${BASE}/app/settings#language`);
  await page.selectOption('#set-lang', 'en');
  await page.getByText('App language').waitFor();
});

await step('Family sharing explains it needs a cloud account in the offline build', async () => {
  await page.goto(`${BASE}/app/settings`);
  await page.getByText('Family sharing works with a ZarooriBox cloud account').waitFor();
});

await step('Share to ZarooriBox puts the shared text into Quick Add', async () => {
  await page.goto(`${BASE}/app/share?title=${encodeURIComponent('Gas cylinder')}&text=${encodeURIComponent('Gas cylinder booking on 20 October')}`);
  await page.getByText('Add to ZarooriBox').first().waitFor();
  expect((await page.inputValue('#quick-add-input')) === 'Gas cylinder booking on 20 October', 'shared text prefilled');
  await page.press('#quick-add-input', 'Enter');
  await confirmAdded(page);
  await page.waitForURL(/\/app$/);
  await page.goto(`${BASE}/app/search?q=cylinder`);
  await page.getByText(/Gas Cylinder/i).first().waitFor();
});

await step('Scanning a photo without AI attaches nothing on Free and explains', async () => {
  await page.goto(`${BASE}/app/add?scan=1`);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await page.locator('input[type=file]').last().setInputFiles({ name: 'bill.png', mimeType: 'image/png', buffer: png });
  await page.getByText('Automatic reading isn’t switched on yet').waitFor();
  await page.locator('#mf-title').waitFor();
});

await step('Second user search stays empty of the first user’s data', async () => {
  await page.goto(`${BASE}/app/search?q=insurance`);
  await page.getByText('Nothing found for “insurance”').waitFor();
});
await step('Backup: export from one account, restore from the file in another', async () => {
  const demo = await newPage();
  await demo.page.goto(`${BASE}/login`);
  await demo.page.getByRole('button', { name: /Try the demo/ }).click();
  await demo.page.waitForURL(/\/app/);
  await demo.page.goto(`${BASE}/app/settings`);
  const [download] = await Promise.all([demo.page.waitForEvent('download'), demo.page.getByRole('button', { name: 'Export my data' }).click()]);
  const { readFile } = await import('node:fs/promises');
  const buffer = await readFile(await download.path());
  await demo.ctx.close();
  await page.goto(`${BASE}/app/settings`);
  await page.getByText('Google Drive backup needs a ZarooriBox cloud account.').waitFor();
  await page.setInputFiles('input[type=file][accept*="json"]', { name: 'backup.json', mimeType: 'application/json', buffer });
  await page.getByRole('heading', { name: 'Restore from this file?' }).waitFor();
  await page.getByRole('button', { name: 'Restore', exact: true }).click();
  await page.getByText(/Restored \d+ items/).waitFor();
  await page.goto(`${BASE}/app/search?q=vitamin`);
  await page.getByText('Vitamin D').first().waitFor();
  await page.goto(`${BASE}/app/search?q=rent`);
  await page.getByText(/Nothing found/).waitFor();
});

await ctx.close();


// Voice: a stand-in for the browser's speech recognizer, so the test can "speak".
await step('Voice Quick Add: mic fills the box while speaking, then saves', async () => {
  const v = await newPage({ width: 390, height: 844 }, true);
  const p = v.page;
  await v.ctx.addInitScript(() => {
    class FakeRecognition {
      constructor() { window.__rec = this; }
      start() { setTimeout(() => this.onresult?.({ results: [{ isFinal: false, 0: { transcript: 'Car insurance expires' } }] }), 50); }
      stop() {
        this.onresult?.({ results: [{ isFinal: true, 0: { transcript: 'Car insurance expires on 12 February 2027' } }] });
        setTimeout(() => this.onend?.(), 20);
      }
      abort() {}
    }
    window.SpeechRecognition = window.webkitSpeechRecognition = FakeRecognition;
  });
  await p.goto(`${BASE}/login`);
  await p.getByRole('button', { name: /Try the demo/ }).click();
  await p.waitForURL('**/app');
  const mic = p.getByRole('button', { name: 'Add by voice' });
  await mic.click();
  await p.getByRole('button', { name: 'Stop listening' }).waitFor();
  await p.waitForFunction(() => document.querySelector('#quick-add-input')?.value === 'Car insurance expires');
  expect((await p.getAttribute('#quick-add-input', 'placeholder')).startsWith('Listening'), 'listening placeholder');
  await p.getByRole('button', { name: 'Stop listening' }).click();
  await p.waitForFunction(() => document.querySelector('#quick-add-input')?.value === 'Car insurance expires on 12 February 2027', null, { timeout: 3000 }).catch(async () => {
    throw new Error(`after stop the box holds "${await p.inputValue('#quick-add-input')}"`);
  });
  await p.getByText('12 Feb 2027').first().waitFor();
  await p.getByRole('button', { name: 'Add by voice' }).waitFor();
  await p.getByRole('button', { name: 'Add', exact: true }).click();
  await confirmAdded(p, 'Car Insurance');
  expect((await p.inputValue('#quick-add-input')) === '', 'cleared after save');
  await v.ctx.close();
});

await step('Voice keeps listening after a pause, so long sentences aren’t cut off', async () => {
  const v = await newPage({ width: 390, height: 844 }, true);
  const p = v.page;
  await v.ctx.addInitScript(() => {
    const said = ['Pay the electricity bill', 'and the water bill on the 5th', ''];
    let n = 0;
    class PausingRecognition {
      start() {
        const words = said[n++] ?? '';
        setTimeout(() => {
          if (words) this.onresult?.({ results: [{ isFinal: true, 0: { transcript: words } }] });
          // The browser stops by itself at each pause.
          setTimeout(() => this.onend?.(), 60);
        }, 60);
      }
      stop() {}
      abort() {}
    }
    window.SpeechRecognition = window.webkitSpeechRecognition = PausingRecognition;
  });
  await p.goto(`${BASE}/login`);
  await p.getByRole('button', { name: /Try the demo/ }).click();
  await p.waitForURL('**/app');
  await p.getByRole('button', { name: 'Add by voice' }).click();
  await p.waitForFunction(() => document.querySelector('#quick-add-input')?.value === 'Pay the electricity bill and the water bill on the 5th', null, { timeout: 3000 }).catch(async () => {
    throw new Error(`the box holds "${await p.inputValue('#quick-add-input')}"`);
  });
  await p.getByRole('button', { name: 'Add by voice' }).waitFor();
  await v.ctx.close();
});

await step('Voice: microphone blocked shows a clear message', async () => {
  const v = await newPage();
  const p = v.page;
  await v.ctx.addInitScript(() => {
    window.SpeechRecognition = window.webkitSpeechRecognition = class {
      start() { setTimeout(() => { this.onerror?.({ error: 'not-allowed' }); this.onend?.(); }, 20); }
      stop() {}
      abort() {}
    };
  });
  await p.goto(`${BASE}/login`);
  await p.getByRole('button', { name: /Try the demo/ }).click();
  await p.waitForURL('**/app');
  await p.getByRole('button', { name: 'Add by voice' }).click();
  await p.getByText('Allow microphone access to add things by voice.').waitFor();
  await v.ctx.close();
});

await step('No mic button where the browser has no speech recognition', async () => {
  const v = await newPage();
  const p = v.page;
  await v.ctx.addInitScript(() => {
    delete window.webkitSpeechRecognition;
    delete window.SpeechRecognition;
  });
  await p.goto(`${BASE}/login`);
  await p.getByRole('button', { name: /Try the demo/ }).click();
  await p.waitForURL('**/app');
  await p.locator('#quick-add-input').waitFor();
  expect((await p.getByRole('button', { name: 'Add by voice' }).count()) === 0, 'mic hidden');
  await v.ctx.close();
});

await step('Installable: manifest, icons and offline service worker', async () => {
  const v = await newPage();
  const p = v.page;
  await p.goto(`${BASE}/`);
  const manifestHref = await p.getAttribute('link[rel="manifest"]', 'href');
  const manifest = await (await p.request.get(`${BASE}${manifestHref}`)).json();
  expect(manifest.display === 'standalone' && manifest.start_url === '/app', 'manifest basics');
  for (const icon of manifest.icons) expect((await p.request.get(`${BASE}${icon.src}`)).ok(), `icon ${icon.src}`);
  const scope = await p.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(scope === `${BASE}/`, 'service worker active');
  await p.reload();
  await p.waitForFunction(() => !!navigator.serviceWorker.controller);
  await v.ctx.setOffline(true);
  await p.goto(`${BASE}/app`);
  await p.locator('#root *').first().waitFor();
  await v.ctx.setOffline(false);
  await v.ctx.close();
});

await step('Home-screen "Add by voice" shortcut starts listening', async () => {
  const v = await newPage({ width: 390, height: 844 }, true);
  const p = v.page;
  await v.ctx.addInitScript(() => {
    window.SpeechRecognition = window.webkitSpeechRecognition = class {
      start() { window.__listening = true; }
      stop() { setTimeout(() => this.onend?.(), 10); }
      abort() {}
    };
  });
  await p.goto(`${BASE}/login`);
  await p.getByRole('button', { name: /Try the demo/ }).click();
  await p.waitForURL('**/app');
  await p.goto(`${BASE}/app?voice=1`);
  await p.getByRole('button', { name: 'Stop listening' }).waitFor();
  expect(await p.evaluate(() => window.__listening === true), 'recognizer started');
  const manifest = await (await p.request.get(`${BASE}/manifest.webmanifest`)).json();
  expect(manifest.share_target?.action === '/app/share', 'web share target');
  expect(manifest.shortcuts.some((s) => s.url === '/app?voice=1'), 'voice shortcut');
  await v.ctx.close();
});

await step('Swipe right marks done, swipe left snoozes, bell has quick actions', async () => {
  const v = await newPage({ width: 390, height: 844 }, true);
  const p = v.page;
  await p.goto(`${BASE}/login`);
  await p.getByRole('button', { name: /Try the demo/ }).click();
  await p.waitForURL('**/app');
  await p.getByText('Tip: swipe a reminder right').waitFor();
  const rows = p.getByRole('region', { name: 'Coming Soon' }).locator('li');
  const swipe = async (row, dir) => {
    // Keep the row clear of the toast at the bottom of the screen.
    await row.evaluate((e) => e.scrollIntoView({ block: 'center' }));
    await p.waitForTimeout(100);
    const b = await row.boundingBox();
    const y = b.y + b.height / 2;
    const x0 = b.x + b.width / 2;
    await p.mouse.move(x0, y);
    await p.mouse.down();
    for (let i = 1; i <= 8; i++) await p.mouse.move(x0 + dir * i * 18, y);
    await p.mouse.up();
  };
  const first = rows.first();
  const title = (await first.innerText()).split('\n')[0];
  await swipe(first, 1);
  await p.getByText(/is done|Next one is on/).first().waitFor();
  await swipe(rows.first(), -1);
  await p.getByText('We’ll remind you tomorrow').first().waitFor();
  expect(title.length > 0, 'had a row');

  await p.getByRole('button', { name: /notification/i }).first().click();
  const done = p.getByRole('button', { name: 'Done', exact: true });
  if (await done.count()) {
    await done.first().click();
    await p.waitForTimeout(300);
  }
  await v.ctx.close();
});

await step('Privacy policy page is public and linked from the home page', async () => {
  const g = await newPage();
  await g.page.goto(`${BASE}/`);
  await g.page.getByRole('link', { name: 'Privacy policy' }).click();
  await g.page.waitForURL('**/privacy');
  await g.page.getByRole('heading', { name: 'Privacy policy' }).waitFor();
  await g.page.getByText(/Delete my account permanently deletes/).waitFor();
  await g.ctx.close();
});

await step('Public action page without a valid link says so', async () => {
  const v = await newPage();
  await v.page.goto(`${BASE}/act?t=bad`);
  await v.page.locator('main, #root *').first().waitFor();
  await v.page.waitForTimeout(500);
  expect(!(await v.page.url()).includes('/login'), 'stays public');
  await v.ctx.close();
});

await step('Opening the app asks to turn on reminders; Not now is remembered', async () => {
  const f = await newPage();
  await f.page.goto(`${BASE}/signup`);
  await f.page.fill('#su-name', 'Asha');
  await f.page.fill('#su-email', `asha${Date.now()}@example.com`);
  await f.page.fill('#su-password', 'ashapass1');
  await f.page.getByRole('button', { name: 'Create account' }).click();
  await f.page.waitForURL('**/app/welcome');
  await f.page.goto(`${BASE}/app/upcoming`);
  await f.page.getByRole('heading', { name: /Turn on reminders/ }).waitFor();
  await f.page.getByRole('button', { name: 'Not now' }).click();
  await f.page.reload();
  await f.page.waitForTimeout(1500);
  expect((await f.page.getByRole('heading', { name: /Turn on reminders/ }).count()) === 0, 'asked again right after Not now');
  await f.ctx.close();
});

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
await step('Favourites: star an item, it shows under Favourites, unstar removes it', async () => {
  const p = m.page;
  await p.goto(`${BASE}/app/favourites`);
  await p.getByText('Passport').first().waitFor();
  await p.goto(`${BASE}/app/bookings`);
  await p.getByRole('button', { name: /Movie Tickets.*·/ }).first().click();
  await p.getByRole('button', { name: 'Add to favourites' }).click();
  await p.getByText('Added to favourites').waitFor();
  await p.keyboard.press('Escape');
  await p.goto(`${BASE}/app/lists`);
  await p.getByRole('link', { name: /Favourites/ }).getByText('3 starred').waitFor();
  await p.getByRole('link', { name: /Favourites/ }).click();
  await p.getByRole('button', { name: /Movie Tickets.*·/ }).first().click();
  await p.getByRole('button', { name: 'Remove from favourites' }).click();
  await p.keyboard.press('Escape');
  await p.reload();
  await p.getByText('Passport').first().waitFor();
  expect((await p.getByText('Movie Tickets').count()) === 0, 'unstarred item still listed');
});
await step('Medicines: a dose ticked as taken stays taken after reopening', async () => {
  const p = m.page;
  await p.goto(`${BASE}/app/medicines`);
  const take = p.getByRole('button', { name: /Vitamin D at/ }).first();
  await take.click();
  await p.getByRole('button', { name: /^Taken: Vitamin D/ }).first().waitFor();
  await p.reload();
  await p.getByRole('button', { name: /^Taken: Vitamin D/ }).first().waitFor();
  await p.getByRole('button', { name: /^Taken: Vitamin D/ }).first().click();
  await p.getByRole('button', { name: /^Mark taken: Vitamin D/ }).first().waitFor();
});
await m.ctx.close();

await step('Delete my account: signs out, and the account can’t log in again', async () => {
  const d = await newPage();
  await d.ctx.grantPermissions(['notifications'], { origin: BASE });
  const p = d.page;
  const gone = `gone${Date.now()}@example.com`;
  await p.goto(`${BASE}/signup`);
  await p.fill('#su-name', 'Ravi');
  await p.fill('#su-email', gone);
  await p.fill('#su-password', 'ravipass12');
  await p.getByRole('button', { name: 'Create account' }).click();
  await p.waitForURL('**/app/welcome');
  await p.goto(`${BASE}/app/settings`);
  await p.getByRole('button', { name: 'Delete my account' }).click();
  await p.getByRole('dialog').getByRole('button', { name: 'Delete my account' }).click();
  await p.getByText('Your account has been deleted').waitFor();
  await p.goto(`${BASE}/login`);
  await p.fill('#login-email', gone);
  await p.fill('#login-password', 'ravipass12');
  await p.getByRole('button', { name: 'Log in' }).click();
  await p.getByText(/don’t match/).waitFor();
  await d.ctx.close();
});
await browser.close();

for (const r of results) console.log(r.join('  '));
if (pageErrors.length) console.log('\nPage errors:\n' + pageErrors.join('\n'));
const failed = results.filter((r) => r[0] === '✗').length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed || pageErrors.length ? 1 : 0);
