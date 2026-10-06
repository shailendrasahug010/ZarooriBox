# LifeBox

**Everything you don't want to forget.**

LifeBox is a personal memory assistant for bills, renewals, home maintenance, shopping, things you lent or borrowed, warranties, documents and important dates. Type something like *"Bike insurance expires on 17 November"* and LifeBox works out the date, category and reminder for you.

## Run it locally

Requires Node.js 20+.

```bash
npm install
npm run dev          # http://localhost:5173
```

Open the site, then click **Try the demo with sample data** (on the landing page or the login screen) to explore a fully populated account, or **Start Free** to create your own (empty) account.

With no configuration, LifeBox runs entirely in your browser: accounts and data are stored in `localStorage` on that device. Nothing is sent anywhere.

Other commands:

```bash
npm run build        # type-check + production build into dist/
npm run preview      # serve the production build on :4173
npm test             # unit tests (parser, store, auth, data isolation)
npm run e2e          # browser walkthrough of every core flow (needs `npm run preview` running
                     # and Chromium; set CHROME_PATH if it isn't at /opt/pw-browsers)
```

## Switch to Supabase (real accounts, sync across devices)

1. Create a Supabase project.
2. In the SQL editor, run [`supabase/schema.sql`](supabase/schema.sql). It creates every table, row-level security on each one, ownership triggers and a private storage bucket for attachments.
3. In Auth settings, enable Email, and optionally **Google** (for "Continue with Google") and **Anonymous sign-ins** (for the demo button).
4. Copy `.env.example` to `.env.local` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
5. `npm run dev` — auth and data now go through Supabase. No code changes.

Optional: deploy `supabase/functions/send-reminders` and schedule it with Supabase Cron to send email / WhatsApp / SMS reminders once you plug a provider into its channel adapters.

## Deploy

It's a static single-page app. Build with `npm run build` and host `dist/` on Vercel, Netlify, Cloudflare Pages or Supabase hosting. Configure a SPA fallback so every path serves `index.html` (Vercel and Netlify detect Vite automatically; on Netlify add `/* /index.html 200` to `public/_redirects`).

## How it's built

React 19 + TypeScript + Tailwind CSS 4 (Vite), React Router, lucide icons.

```
src/
  types.ts                 Domain model (User, Memory, Reminder, RecurringItem, Person,
                           Lending, ShoppingItem, Notification, Attachment, Category, settings)
  lib/
    parser/                Quick Add: rule-based natural-language parser + AI drop-in
    dates.ts               Local-date maths, recurrence, relative labels
    selectors.ts           Urgency (🔴/🟡/🟢), due today, coming soon, expiry radar
    search.ts, calendar.ts Global search and calendar projection (incl. future repeats)
    notifications/         Channel interface (browser today; email/WhatsApp/SMS server-side) + scheduler
    plans.ts               Free/Pro entitlements (everything unlocked during early access)
  data/                    Repository port with localStorage and Supabase adapters, demo seed
  auth/                    Auth port with local (PBKDF2-hashed) and Supabase implementations
  store/                   LifeBoxStore: all business rules, optimistic writes, undo; React bindings
  components/, layouts/, pages/   UI
supabase/                  schema.sql (RLS) + send-reminders edge function
e2e/                       Playwright walkthrough + screenshot script
```

Key design points:

- **Storage is swappable.** Screens only talk to `LifeBoxStore`, which talks to a `Repository`. `localStorage` and Supabase implement the same interface.
- **Data isolation.** Locally, each user's data lives under their own key, every write checks ownership and reads filter out foreign rows. In Supabase, row-level security enforces `user_id = auth.uid()` on every table and storage path, and triggers stop a row pointing at someone else's parent record.
- **Separate tables, not one blob.** Reminders, recurrence rules, people, lendings, shopping items, notifications and attachments are their own entities with foreign keys.
- **Quick Add is pluggable.** `ruleParser.ts` handles dates (17 Nov, 12/02/2027, tomorrow, next Friday, in 3 weeks, on the 5th), repeats (every 6 months, quarterly, every Monday), amounts (₹2,000, Rs 500, 2k), lending/borrowing phrases and shopping lists. Set `VITE_AI_PARSER_URL` to a server endpoint returning the same shape to use an LLM, with the rules as fallback.
- **Repeating items roll forward.** Ticking off "RO filter, every 6 months" moves it to the next date instead of closing it.
- **Notifications.** In-app notifications always; browser notifications after permission. Email, WhatsApp and SMS appear in settings as coming soon and are implemented server-side via the edge function.
- **Future features** (family sharing, OCR, voice, Google Calendar, location reminders) slot in as new repository tables, parser providers, notification channels or plan features without changing screens.

## Accessibility

Semantic landmarks and headings, labelled controls, visible focus rings, a skip link, focus-trapped dialogs that close on Escape, keyboard-navigable calendar (arrow keys), live regions for toasts, 44px touch targets, and `prefers-reduced-motion` support.
