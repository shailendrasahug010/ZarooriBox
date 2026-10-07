# ZarooriBox

**Everything important, in one place.**

ZarooriBox is a personal memory assistant for bills, renewals, home maintenance, shopping, things you lent or borrowed, warranties, documents and important dates. Type or say something like *"Bike insurance expires on 17 November"* and ZarooriBox works out the date, category and reminder for you.

It runs as a website, as an installable web app, and as an Android and iPhone app built from the same code.

### What it does

- **Quick Add by typing or voice**, in English, Hindi or Hinglish ("कल बिजली का बिल भरना है", "Rahul ko 500 diye"). Voice works in 11 Indian languages plus Indian English.
- **Scan a document**: photograph a passport, policy, bill or warranty card and ZarooriBox fills in the name, expiry or due date and amount (needs the AI key below).
- **Done / Tomorrow / Next week** right from phone alerts, browser notifications, the bell and reminder emails. Swipe a reminder right to finish it, left to snooze it, with undo.
- **Family sharing**: create a family in Settings, share the 8-letter invite code, then share any bill or item. The shopping list is shared automatically. Each person gets their own reminders at their own time.
- **Hindi screens** (Settings → Language), a short first-run setup, and search across everything including attachment names.
- **Faster adding on Android**: long-press the app icon for *Add by voice*, *Scan a document* and *Shopping list*, or share text or a photo from WhatsApp, Gallery or Messages to ZarooriBox.

## Run it locally

Requires Node.js 20+.

```bash
npm install
npm run dev          # http://localhost:5173
```

Open the site, then click **Try the demo with sample data** (on the landing page or the login screen) to explore a fully populated account, or **Start Free** to create your own (empty) account.

`npm run dev` and `npm run build` use the live ZarooriBox Supabase project (settings in `.env.production`, which holds only the public URL and publishable key). To run ZarooriBox entirely in your browser instead, with accounts and data kept in `localStorage` on that device, use `npm run build:local` or delete `.env.production`.

Other commands:

```bash
npm run build        # type-check + production build into dist/
npm run preview      # serve the production build on :4173
npm test             # unit tests (parser, AI validation, store, auth, notifications)
npm run build:local  # same, but with browser-only storage (no Supabase)
npm run e2e          # browser walkthrough of every core flow (run `npm run build:local` and
                     # `npm run preview` first; needs Chromium, set CHROME_PATH if it isn't at /opt/pw-browsers)
```

## Supabase (real accounts, sync across devices)

ZarooriBox is already connected to its Supabase project (`usuityljxclilfljwvvd`, Mumbai): the schema, row-level security, storage bucket, both edge functions and the 15-minute reminder schedule are live. To set up your own project instead:

1. Create a Supabase project.
2. In the SQL editor, run [`supabase/schema.sql`](supabase/schema.sql). It creates every table, row-level security on each one, ownership triggers and a private storage bucket for attachments. It is safe to run again after updates.
3. In **Authentication → Providers**, enable Email, and optionally **Anonymous sign-ins** (for the demo button).
4. Put your project's values in `.env.production` (or `.env.local`): `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
5. `npm run dev`. Auth and data now go through Supabase. No code changes.

### Continue with Google

1. In Google Cloud Console, create an OAuth client (type *Web application*). Add `https://<project-ref>.supabase.co/auth/v1/callback` as an authorised redirect URI.
2. In Supabase **Authentication → Providers → Google**, paste the client ID and secret and enable it.
3. In **Authentication → URL Configuration**, set the Site URL to your website and add these redirect URLs: `https://your-site/app`, `https://your-site/reset-password`, `http://localhost:5173/**` and, for the phone app, `app.zaroori://auth-callback`.

### AI Quick Add (Claude)

Quick Add understands sentences with built-in rules. With AI on, it also asks Claude, which handles freer phrasing ("ring the plumber day after tomorrow", "Neha still has my Harry Potter books"). The app checks every field Claude returns and falls back to the rules if anything is off, so Quick Add never breaks.

```bash
supabase functions deploy parse-quick-add
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
# optional: supabase secrets set ZAROORI_AI_MODEL=claude-opus-5-5 ALLOWED_ORIGIN=https://your-site
```

Only signed-in users can call it. Set `VITE_AI_QUICK_ADD=off` to use rules only.

The same key powers **document scanning** (`supabase functions deploy scan-document`). Without it, a scanned photo is still attached and the person fills in the details.

### Google Drive backup

Every night the `drive-backup` function saves each person's items to a **ZarooriBox** folder in their own Google Drive. On a new phone they log in, open **Settings → Google Drive backup**, connect the same Google account and restore. ZarooriBox only asks for the `drive.file` permission, so it can see the files it created and nothing else in their Drive. The daily run never replaces a full backup with a nearly empty account (a new phone that hasn't restored yet); **Back up now** can. **Settings → Privacy & data → Restore from a file** restores an exported file the same way.

1. In Google Cloud Console, enable the **Google Drive API**. Create an OAuth client (type *Web application*; you can reuse the Google sign-in one) and add `https://<project-ref>.supabase.co/functions/v1/drive-backup` as an authorised redirect URI.
2. On the OAuth consent screen, add the scope `.../auth/drive.file`. It isn't a restricted scope, so no Google security review is needed.
3. Set the secrets and deploy:

```bash
supabase secrets set GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... ZAROORI_APP_URL=https://your-site
supabase functions deploy drive-backup --no-verify-jwt   # it checks sign-in itself
```

Google sends people back only to the phone app or to `ZAROORI_APP_URL` / `ALLOWED_ORIGIN` (and localhost), and the signed-in app finishes the link, so nobody can attach someone else's Drive to their account. Refresh tokens are stored encrypted (with `DRIVE_TOKEN_KEY` if set, else the service role key) in `drive_backups`, which only the function can read. [`supabase/cron.sql`](supabase/cron.sql) schedules the nightly run at 03:00 India time.

### Family sharing

Family sharing needs a Supabase account (it is hidden in the offline build). The tables, row-level security and the `create_household`, `join_household` and `leave_household` functions are in [`supabase/schema.sql`](supabase/schema.sql). Members can see and update items shared with their family; only the owner can stop sharing an item. Leaving a family makes your own items private again.

### Email, WhatsApp and SMS reminders

The `send-reminders` function sends each person what's due at the time they picked in Settings, in their own timezone: one morning summary, or one message per item if they turn the summary off. Each channel switches on when its secrets are set; the others keep working without it.

| Channel | Provider | Secrets |
| --- | --- | --- |
| Email | [Resend](https://resend.com) | `RESEND_API_KEY`, `RESEND_FROM` (e.g. `ZarooriBox <reminders@yourdomain.com>`) |
| WhatsApp | Meta WhatsApp Cloud API | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE` (an approved template whose body has one variable, e.g. `ZarooriBox reminder: {{1}}`), optional `WHATSAPP_TEMPLATE_LANG` |
| SMS | Twilio | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` |

```bash
supabase functions deploy send-reminders --no-verify-jwt   # it checks callers itself
supabase secrets set ZAROORI_APP_URL=https://your-site
supabase secrets set RESEND_API_KEY=... RESEND_FROM="ZarooriBox <reminders@yourdomain.com>"
```

Reminder emails carry **Done / Tomorrow / Next week** links. They open `ZAROORI_APP_URL/act`, which asks the `reminder-action` function to make the change; the link is signed for one person and one item and expires after 30 days. Set `ZAROORI_APP_URL` to your deployed site or the buttons point nowhere. Links are signed with the service role key unless you set `ACTION_SECRET`.

```bash
supabase functions deploy reminder-action --no-verify-jwt   # the signed link is the proof
```

Then run [`supabase/cron.sql`](supabase/cron.sql) (fill in your project ref) to call it every 15 minutes. It creates its own secret in Supabase Vault, so there is nothing to copy around. In the app, **Settings → Notifications** now has live switches, a mobile number field and **Send me a test message**. WhatsApp and SMS are Pro channels; set `ZAROORI_EARLY_ACCESS=false` when you start charging.

## Phone app (Android and iPhone)

The `android/` and `ios/` folders are [Capacitor](https://capacitorjs.com) projects that wrap the same build. The phone app adds:

- **Voice Quick Add** with the phone's own speech recognizer (the website uses the browser's).
- **Reminders while the app is closed**: alerts are scheduled with the phone at your chosen time.
- Google sign-in through the system browser, the Android back button, splash screen and app icon.
- **Done / Tomorrow / Next week buttons** on reminder alerts.
- **Android home-screen shortcuts** (long-press the icon) and **Share to ZarooriBox** for text and photos. On iPhone, Share and Quick Actions need an extension added in Xcode; the `app.zaroori://add?voice=1`, `app.zaroori://scan` and `app.zaroori://share?text=…` links already work for Shortcuts.

The phone app uses the same Supabase account as the website (it is built with `.env.production`). Build with `npm run build:local` instead to keep everything on the phone.

**Get an Android APK without installing anything:** every push to `main` builds one in GitHub Actions (**Actions → Android app → latest run → Artifacts → zaroori-android-debug**). Unzip it, copy `app-debug.apk` to your phone and open it (allow "install unknown apps"). It connects to the ZarooriBox Supabase project automatically.

**Build it yourself:**

```bash
npm run build && npx cap sync
npx cap open android     # Android Studio: Run, or Build → Build APK / Generate Signed Bundle for Play Store
npx cap open ios         # Xcode on a Mac: pick your team under Signing, then Run on your iPhone
```

After changing web code, run `npm run build && npx cap sync` again. Icons and splash screens come from `assets/` (`npx @capacitor/assets generate`).

**Install from the browser instead:** on the deployed website, Chrome/Edge show an *Install* button and iPhone Safari has *Share → Add to Home Screen*. The installed web app opens full screen and works offline.

## Deploy

It's a static single-page app. Build with `npm run build` and host `dist/` on Vercel, Netlify, Cloudflare Pages or Supabase hosting. Configure a SPA fallback so every path serves `index.html` (Vercel and Netlify detect Vite automatically; on Netlify `public/_redirects` already does it).

## How it's built

React 19 + TypeScript + Tailwind CSS 4 (Vite), React Router, lucide icons.

```
src/
  types.ts                 Domain model (User, Memory, Reminder, RecurringItem, Person,
                           Lending, ShoppingItem, Notification, Attachment, Category, settings)
  lib/
    parser/                Quick Add: rule-based parser + AI parser (validated, falls back to rules)
    voice.ts               Voice input: phone speech recognizer or the browser's Web Speech API
    dates.ts               Local-date maths, recurrence, relative labels
    selectors.ts           Urgency (🔴/🟡/🟢), due today, coming soon, expiry radar
    search.ts, calendar.ts Global search and calendar projection (incl. future repeats)
    notifications/         Channels (browser, phone, email/WhatsApp/SMS via server) + schedulers
    plans.ts               Free/Pro entitlements (everything unlocked during early access)
  data/                    Repository port with localStorage and Supabase adapters, demo seed
  auth/                    Auth port with local (PBKDF2-hashed) and Supabase implementations
  store/                   ZarooriStore: all business rules, optimistic writes, undo; React bindings
  components/, layouts/, pages/   UI
  platform.ts              Phone-app start-up (back button, splash) and web-app service worker
supabase/
  schema.sql               Tables, row-level security, ownership and settings-protection triggers
  cron.sql                 Runs send-reminders every 15 minutes
  functions/               parse-quick-add and scan-document (Claude), send-reminders (Resend, WhatsApp, Twilio), reminder-action (email buttons)
android/, ios/             Capacitor phone-app projects
.github/workflows/         Tests, Android APK build, iOS build check
e2e/                       Playwright walkthrough + screenshot script
```

Key design points:

- **Storage is swappable.** Screens only talk to `ZarooriStore`, which talks to a `Repository`. `localStorage` and Supabase implement the same interface.
- **Data isolation.** Locally, each user's data lives under their own key, every write checks ownership and reads filter out foreign rows. In Supabase, row-level security enforces `user_id = auth.uid()` on every table and storage path, and triggers stop a row pointing at someone else's parent record.
- **Separate tables, not one blob.** Reminders, recurrence rules, people, lendings, shopping items, notifications and attachments are their own entities with foreign keys.
- **Quick Add is pluggable.** `ruleParser.ts` handles dates (17 Nov, 12/02/2027, tomorrow, next Friday, in 3 weeks, on the 5th), repeats (every 6 months, quarterly, every Monday), amounts (₹2,000, Rs 500, 2k), lending/borrowing phrases and shopping lists. With Supabase it also asks Claude through the `parse-quick-add` function; the result is checked field by field and the rules fill any gap.
- **Repeating items roll forward.** Ticking off "RO filter, every 6 months" moves it to the next date instead of closing it.
- **Notifications.** In-app always; browser pop-ups after permission; OS-scheduled alerts in the phone app; email, WhatsApp and SMS from the `send-reminders` function at each person's local time, each delivered once per due date.
- **Future features** (family sharing, OCR, Google Calendar, location reminders) slot in as new repository tables, parser providers, notification channels or plan features without changing screens.

## Accessibility

Semantic landmarks and headings, labelled controls, visible focus rings, a skip link, focus-trapped dialogs that close on Escape, keyboard-navigable calendar (arrow keys), live regions for toasts, 44px touch targets, and `prefers-reduced-motion` support.
