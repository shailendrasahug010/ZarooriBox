import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '../components/ui';

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-xl font-bold">{title}</h2>
      <div className="mt-2 space-y-2 text-ink-soft">{children}</div>
    </section>
  );
}

/** Privacy policy, linked from the website and the app store listings. */
export default function Privacy() {
  return (
    <div className="min-h-dvh bg-paper">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <Link to="/" aria-label="ZarooriBox home">
            <Logo />
          </Link>
          <Link to="/app" className="btn btn-ghost btn-sm">
            Open the app
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-extrabold tracking-tight">Privacy policy</h1>
        <p className="mt-2 text-sm text-muted">Last updated 7 October 2026</p>
        <p className="mt-6 text-ink-soft">
          ZarooriBox helps you remember the important things in life: bills, renewals, medicines, bookings, money you lent and your shopping list. This page explains what we keep and why. In
          short: your data is yours, only you (and family members you choose to share with) can see it, and we never sell it or show ads.
        </p>

        <Part title="What we keep">
          <p>Your name, email address and a securely hashed password (or your Google account’s name and email if you sign in with Google).</p>
          <p>
            What you add: items, dates, reminders, lists, people and amounts, medicine doses you tick as taken, photos and files you attach, and your settings (language, time zone and how you
            want reminders).
          </p>
        </Part>

        <Part title="Where it is stored">
          <p>
            Your account and data are stored with Supabase, our database provider, in its Mumbai (India) region, over encrypted connections. Database rules make sure each record can only be read
            by its owner and by family members it was shared with. Without an account, the website keeps everything in your own browser only.
          </p>
        </Part>

        <Part title="Services we use to help you">
          <p>
            <strong>Reminders.</strong> If you turn on email, WhatsApp or SMS reminders, the item’s title and date are sent through the messaging provider so the message reaches you.
          </p>
          <p>
            <strong>AI Quick Add and scanning.</strong> When you type a sentence or scan a bill, that text or photo is sent to Anthropic’s Claude to fill in the details. It is not used to train
            models and is not kept by us beyond the item you save.
          </p>
          <p>
            <strong>Google Drive backup.</strong> If you connect Google Drive, ZarooriBox saves a backup file to a ZarooriBox folder in your own Drive. It can only see files it created, nothing
            else in your Drive. You can disconnect it at any time in Settings.
          </p>
        </Part>

        <Part title="Family sharing">
          <p>If you create or join a family, the items you choose to share and the family shopping list are visible to its members. Leaving a family makes your items private again.</p>
        </Part>

        <Part title="What we never do">
          <p>We don’t sell or rent your information, we don’t show ads, and we don’t track you across other apps or websites.</p>
        </Part>

        <Part title="Your choices">
          <p>
            <strong>Export:</strong> Settings → Privacy &amp; data → Export my data downloads everything.
          </p>
          <p>
            <strong>Delete:</strong> Settings → Privacy &amp; data → Delete my account permanently deletes your account, data and files straight away. “Delete all my data” empties your
            account but keeps your login. Backups you saved yourself, such as in your Google Drive, stay with you to delete.
          </p>
          <p>
            <strong>Notifications:</strong> you can turn any reminder channel off in Settings → Notifications, or in your phone’s settings.
          </p>
        </Part>

        <Part title="Children">
          <p>ZarooriBox is meant for adults managing their household. It is not directed at children under 13.</p>
        </Part>

        <Part title="Changes and contact">
          <p>
            If this policy changes, we’ll update this page and the date above. For any privacy question or a deletion request you can’t make in the app, write to the support email shown on
            ZarooriBox’s Google Play or App Store page.
          </p>
        </Part>
      </main>
    </div>
  );
}
