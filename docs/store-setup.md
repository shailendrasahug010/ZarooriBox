# ZarooriBox: account setup, step by step

Everything in the code is ready. These steps need your own accounts, so only you can do them. Do them in this order: the website first, because Google and the stores ask for its address.

Your Supabase project is **lifebox** (ref `usuityljxclilfljwvvd`). Wherever you see `YOUR-SITE`, use your website address from part 1, for example `https://zarooribox.netlify.app`.

---

## 1. Put the website online (Netlify, free)

1. Go to <https://app.netlify.com> and sign up with **GitHub**.
2. Click **Add new site → Import an existing project → GitHub**.
3. Allow Netlify to see the **ZarooriBox** repository and pick it.
4. Leave every setting as it is (the repo's `netlify.toml` already says how to build) and click **Deploy**.
5. When it says **Published**, open **Site configuration → Change site name** and pick a name, e.g. `zarooribox`. Your address is now `https://zarooribox.netlify.app`.

Every merge to `main` now updates the website by itself.

### Tell Supabase the website address

1. Open <https://supabase.com/dashboard/project/usuityljxclilfljwvvd/auth/url-configuration>.
2. **Site URL**: `https://YOUR-SITE`
3. Under **Redirect URLs**, click **Add URL** for each of these:
   - `https://YOUR-SITE/app`
   - `https://YOUR-SITE/reset-password`
   - `app.zaroori://auth-callback`
4. Click **Save**.
5. Open <https://supabase.com/dashboard/project/usuityljxclilfljwvvd/functions/secrets>, click **Add new secret**:
   - Name `ZAROORI_APP_URL`, value `https://YOUR-SITE`
   - Save.

Do **not** add an `ALLOWED_ORIGIN` secret: it would block the phone app from AI Quick Add and scanning.

---

## 2. Google: sign-in and Drive backup

One Google Cloud project covers both.

1. Go to <https://console.cloud.google.com>, top bar → project picker → **New project**, name it `ZarooriBox`, **Create**, then select it.
2. Search bar → **Google Drive API** → **Enable**.
3. Left menu → **APIs & Services → OAuth consent screen** (it may be called **Google Auth Platform**) → **Get started**:
   - App name `ZarooriBox`, support email: yours. Audience: **External**. Contact email: yours. Agree and **Create**.
   - **Branding**: add `https://YOUR-SITE` as the home page and `https://YOUR-SITE/privacy` as the privacy policy. Under **Authorised domains** add `YOUR-SITE` without `https://` and `supabase.co`. Save.
   - **Data access → Add or remove scopes**: tick `.../auth/userinfo.email`, `.../auth/userinfo.profile`, `openid`, and type in `https://www.googleapis.com/auth/drive.file`, tick it, **Update**, **Save**.
   - **Audience → Publish app → Confirm**. (While it says "Testing", Google disconnects Drive backup every 7 days.) `drive.file` only lets ZarooriBox see its own files, so Google doesn't need a security review.
4. **Clients → Create client**:
   - Type **Web application**, name `ZarooriBox`.
   - **Authorised JavaScript origins**: `https://YOUR-SITE`
   - **Authorised redirect URIs**, add both:
     - `https://usuityljxclilfljwvvd.supabase.co/auth/v1/callback`
     - `https://usuityljxclilfljwvvd.supabase.co/functions/v1/drive-backup`
   - **Create**. Copy the **Client ID** and **Client secret** (keep the secret private, don't paste it in chat).

### Switch on Google sign-in

1. <https://supabase.com/dashboard/project/usuityljxclilfljwvvd/auth/providers> → **Google** → turn on.
2. Paste the Client ID and Client secret → **Save**.

### Switch on Drive backup

1. <https://supabase.com/dashboard/project/usuityljxclilfljwvvd/functions/secrets> → add two secrets:
   - `GOOGLE_CLIENT_ID` = the Client ID
   - `GOOGLE_CLIENT_SECRET` = the Client secret
2. Done. In the app, **Settings → Google Drive backup → Connect Google Drive**. The nightly backup is already scheduled (03:00 India time).

---

## 3. Google Play Store

Costs a one-time US$25. A new personal account must first run a **closed test with at least 12 testers for 14 days** before Google allows a public release, so start early.

### a. Create the developer account

1. <https://play.google.com/console/signup>, choose **Yourself** (or **An organisation**), pay, and verify your identity (Google asks for ID and a phone; it can take a few days).

### b. Make your upload key (once, on your computer)

You need Java installed (Android Studio includes it). In a terminal:

```
keytool -genkeypair -v -keystore zaroori-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
```

Pick a strong password and remember it; answer the name questions (anything sensible). Keep `zaroori-upload.jks` and its password somewhere safe, like a password manager. **Never put it in the repo or in chat.**

Turn the file into text for GitHub:

- Windows (PowerShell): `[Convert]::ToBase64String([IO.File]::ReadAllBytes("zaroori-upload.jks")) | Set-Clipboard`
- Mac: `base64 -i zaroori-upload.jks | pbcopy`
- Linux: `base64 -w0 zaroori-upload.jks`

### c. Give GitHub the key

<https://github.com/shailendrasahug010/ZarooriBox/settings/secrets/actions> → **New repository secret**, four times:

| Name | Value |
| --- | --- |
| `ZAROORI_UPLOAD_KEYSTORE_BASE64` | the long text you just copied |
| `ZAROORI_UPLOAD_STORE_PASSWORD` | the password |
| `ZAROORI_UPLOAD_KEY_ALIAS` | `upload` |
| `ZAROORI_UPLOAD_KEY_PASSWORD` | the password (same one) |

### d. Build the store version

1. <https://github.com/shailendrasahug010/ZarooriBox/actions/workflows/android-release.yml> → **Run workflow** → **Run workflow**.
2. When it turns green, open the run and download **zaroori-play-release**. Unzip it: `app-release.aab` is for the Play Store.

### e. Create the app in Play Console

1. **Create app**: name `ZarooriBox`, default language English (India) or Hindi, **App**, **Free**, tick the declarations, **Create app**.
2. **Dashboard → Set up your app**, fill in each task:
   - **Privacy policy**: `https://YOUR-SITE/privacy`
   - **App access**: "All or some functionality is restricted" → add instructions: "Tap Try the demo on the login screen" (no password needed).
   - **Ads**: No ads.
   - **Content rating**: fill the questionnaire (category Utility/Productivity; answer No to everything violent etc.).
   - **Target audience**: 18 and over.
   - **Data safety**: collects **Name, Email, User IDs**; **Photos and files** (attachments); **Health info** (medicine names) if asked; **Calendar/events** (reminders). Purpose: **App functionality** and **Account management**. Encrypted in transit: **Yes**. Users can request deletion: **Yes** (link `https://YOUR-SITE/privacy`). Data not shared or sold.
   - **Account deletion URL**: `https://YOUR-SITE/privacy` (it explains Settings → Delete my account).
   - **Government apps / Financial features / Health**: No (it's a personal reminder app, not a medical device).
3. **Main store listing**: short description, full description, app icon (512×512, use `public/icons/icon-512.png`), feature graphic (1024×500), and at least 2 phone screenshots (take them on your phone).
4. **Testing → Closed testing → Create track** → **Create new release** → upload `app-release.aab` → let Google manage the app signing key (**Use Google-generated key**) → **Next → Save → Send for review**. Add 12+ testers' Gmail addresses under **Testers** and share the opt-in link with them.
5. After 14 days of testing: **Production → Create new release** → upload the newest `.aab` → **Review release → Start rollout**.

For each new version: run the **Android release** workflow again and upload the new `.aab` (the version number goes up by itself).

**Optional, automatic uploads**: Play Console → **Setup → API access** → link a Google Cloud project → create a service account with **Release manager** permission → download its JSON key → add it as the GitHub secret `PLAY_SERVICE_ACCOUNT_JSON`. The workflow then sends each build to Play as a draft release; you press **Review release → Start rollout**. The first upload must still be done by hand.

The phone currently has the test build (signed with a different key), so uninstall it once before installing from Play.

---

## 4. iPhone: TestFlight and the App Store

Needs the **Apple Developer Program**: US$99 a year. No Mac needed; GitHub builds it.

### a. Join

1. <https://developer.apple.com/programs/enroll/> with your Apple ID (turn on two-factor first). Pay; approval can take a day or two.

### b. Register the app

1. <https://developer.apple.com/account/resources/identifiers/list> → **+** → **App IDs** → **App** → Description `ZarooriBox`, Bundle ID **Explicit** `app.zaroori` → **Continue → Register**.
2. <https://appstoreconnect.apple.com/apps> → **+ → New App**: iOS, name `ZarooriBox`, language English (India), bundle ID `app.zaroori`, SKU `zarooribox`, Full Access → **Create**.

### c. Your team ID

<https://developer.apple.com/account> → **Membership details** → copy the 10-character **Team ID**.

### d. An API key for GitHub

1. <https://appstoreconnect.apple.com/access/integrations/api> → **Team Keys** (request access the first time) → **+**.
2. Name `GitHub`, Access **Admin** → **Generate**.
3. Copy the **Issuer ID** (above the list) and the key's **Key ID**, and **Download** the `.p8` file (Apple lets you download it only once).

### e. Give GitHub the keys

<https://github.com/shailendrasahug010/ZarooriBox/settings/secrets/actions> → **New repository secret**:

| Name | Value |
| --- | --- |
| `APPLE_TEAM_ID` | the Team ID |
| `ASC_KEY_ID` | the Key ID |
| `ASC_ISSUER_ID` | the Issuer ID |
| `ASC_KEY_P8` | open the `.p8` file in Notepad/TextEdit and paste everything, including the BEGIN and END lines |

### f. Build and send to TestFlight

1. <https://github.com/shailendrasahug010/ZarooriBox/actions/workflows/ios-testflight.yml> → **Run workflow**.
2. When it's green, wait 10 to 30 minutes for Apple to process the build. It appears in App Store Connect → your app → **TestFlight**.
3. Answer the export compliance question if asked (the app says it uses no special encryption, so it usually isn't).
4. **Internal Testing → +** → add yourself (and family) by Apple ID email. Install the **TestFlight** app on the iPhone and accept the invite. No more 7-day re-signing.

### g. App Store release (when you're ready)

In App Store Connect → your app → **App Store** tab: screenshots (6.7" and 6.5" iPhone), description, keywords, support URL `https://YOUR-SITE`, privacy policy URL `https://YOUR-SITE/privacy`, **App Privacy** answers (same as Play's data safety above), and in **App Review Information** write "Tap Try the demo on the login screen". Pick the TestFlight build → **Add for Review → Submit**.

---

## 5. Family sharing (already in the app)

Needs everyone signed in with a real account (not the demo).

1. **You**: Settings → **Family** → type a family name → **Create a family**. You get an 8-letter invite code; **Send invite** shares it on WhatsApp.
2. **Each family member**: Settings → **Family** → **Join with a code** → enter the code → **Join**.
3. The **shopping list is shared automatically**. To share a bill, medicine or other item, open it and turn on **Share with family**. Family members get its reminders too.
4. Settings → Family → **Leave family** makes your own items private again.

---

## What to keep private

The upload key file and its password, the `.p8` file, and the Google client secret. They go only into GitHub secrets or the Supabase dashboard as described above, never into chat or the code.
