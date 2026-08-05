# Getting the APK onto your phone

The fastest route needs **nothing installed on your computer** — GitHub builds it
for you.

---

## Route 1 — GitHub Actions (recommended)

### Build it

1. Open your repo on GitHub.
2. Click the **Actions** tab.
3. In the left sidebar, choose **Build Android APK**.
4. Click **Run workflow** (top right), leave the variant as `release`, click the
   green **Run workflow** button.
5. Wait 12–20 minutes. The job runs typecheck, lint, 142 tests and a Metro
   bundle before it builds, so a green tick means the app actually compiles.

### Download it

6. Click into the finished run.
7. Scroll to the bottom, to **Artifacts**.
8. Download **glp-care-apk-\<commit\>**. It arrives as a `.zip`.
9. Unzip it — inside is `app-release.apk`.

### Install it

10. Get the APK onto your phone: email it to yourself, put it in Google Drive,
    or connect by USB and copy it across.
11. Tap the file on your phone.
12. Android will say *"For your security, your phone is not allowed to install
    unknown apps from this source"* — tap **Settings**, turn the toggle on, then
    press back and tap the file again.
13. Install. The app appears as **GLP Care**.

> **Upgrading later:** each workflow run signs with a fresh key, so Android will
> refuse to install over the old one. **Uninstall the old app first**, then
> install the new APK. (Your data is on the device, so uninstalling clears it —
> that is expected for a test build. See "Stable signing" below to avoid this.)

---

## Route 2 — On your own computer

You need **JDK 17** and the **Android SDK** (easiest via Android Studio).

```bash
git clone <your repo>
cd GLPProject
npm install

# generate the native Android project from app.config.ts
npx expo prebuild --platform android --clean

# build
npm run apk:debug      # fastest, no signing setup
# → android/app/build/outputs/apk/debug/app-debug.apk
```

Plug your phone in with USB debugging on and install directly:

```bash
npx expo run:android
```

For a release build see [BUILDING_APK.md](BUILDING_APK.md).

---

## Route 3 — EAS Build (no local Android SDK, needs a free Expo account)

```bash
npm i -g eas-cli
eas login
eas build:configure
eas build --platform android --profile preview
```

EAS gives you a download link and a QR code when it finishes, and it manages the
signing key for you — so **upgrades install over the top** without uninstalling.

---

## After you install it

The app works immediately with nothing configured. Everything below runs on the
device:

- The care coach (built-in library, 4 languages)
- Eligibility check with Indian ICMR thresholds
- Education library and myth cards
- Doctor directory with **working call buttons**
- Medication reminders and every notification
- Weight, check-ins, wellness score, milestones, relapse risk

### Turn on the full conversational AI (2 minutes)

1. Get an OpenAI API key from **platform.openai.com → API keys**.
2. Add a small amount of billing credit (this app uses very little —
   `gpt-4o-mini` costs a fraction of a rupee per conversation).
3. In the app: **Settings → AI coach → paste the key → Connect and test**.

You should see *"Connected to gpt-4o-mini"*. The coach now holds real
conversations, remembers context, and can run its tools — book appointments,
log weights, save check-ins, raise refills, start the relapse protocol.

The key is stored in the Android keystore and only ever sent to the AI provider.

### Allow notifications

Android 13+ asks on first launch. If you miss it: **Settings → Notifications →
Check permission** inside the app tells you whether the OS has actually accepted
your reminders.

On **Xiaomi, Oppo, Vivo and OnePlus**, also allow *Autostart* and set battery
usage to *No restrictions* for GLP Care, or the OS will silently kill scheduled
reminders.

---

## Stable signing (so upgrades install over the top)

Create a keystore once and keep it:

```bash
keytool -genkeypair -v -storetype PKCS12 \
  -keystore glpcare.keystore -alias glpcare \
  -keyalg RSA -keysize 2048 -validity 10000
```

Then add these as GitHub repository secrets (**Settings → Secrets and variables
→ Actions**):

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 glpcare.keystore` |
| `ANDROID_KEYSTORE_PASSWORD` | the store password you chose |
| `ANDROID_KEY_PASSWORD` | the key password you chose |

The workflow uses them when present and falls back to a throwaway key when they
are absent.

---

## Troubleshooting

**"App not installed"** — an older build with a different signature is already
there. Uninstall it first.

**The workflow fails at "Assemble APK"** — open the failed step and read the
Gradle error. The most common cause is a dependency added without re-running
`expo prebuild`.

**The AI says it is offline even after adding a key** — open Settings → AI and
press *Save and test*. It will tell you exactly what is wrong: wrong key, no
credit, wrong model name, or rate limited.

**Call buttons do nothing** — this needs a real phone; emulators have no dialler.
On a real device they always open the dialler: the app fires the `tel:` intent
directly rather than asking `canOpenURL` first, which on Android 11+ answers
"no" for a dialler that plainly exists (package visibility filtering). The
`<queries>` declaration that fixes the capability checks lives in
`plugins/withAndroidQueries.js` — it is a config plugin because `expo prebuild`
regenerates `AndroidManifest.xml` on every build.
