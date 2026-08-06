# Building the APK

Three routes. Pick by what you have available.

| Route | Needs | Time | Best for |
|---|---|---|---|
| GitHub Actions | a GitHub repo | ~15 min | **no local setup at all** |
| EAS Build | an Expo account | ~15 min | no local Android SDK |
| Local Gradle | JDK 17 + Android SDK | ~10 min first, ~2 after | iterating |

---

## Route 1 — GitHub Actions (recommended first APK)

The workflow at `.github/workflows/android-apk.yml` runs typecheck, lint, tests
and a Metro bundle, then prebuilds and assembles a signed release APK. The
GitHub-hosted runner already has the Android SDK, so there is nothing to install.

1. Push this repository to GitHub.
2. Actions tab → **Build Android APK** → **Run workflow**.
3. When it finishes, download **glp-care-apk-\<sha\>** from the run's Artifacts.
4. Unzip, copy the `.apk` to your phone, and install (you will need to allow
   "install from unknown sources").

It builds with no secrets configured — you get a working app running on the
bundled care library. To bake in the backend, add repository secrets:

| Secret | Purpose |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | connects the app to your project |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | same |
| `EAS_PROJECT_ID` | push notifications |
| `ANDROID_KEYSTORE_PASSWORD` | signing (a CI default is used if absent) |
| `ANDROID_KEY_PASSWORD` | signing |

> The workflow generates a throwaway keystore per run so the release APK is
> signed and installable. That is fine for testing, **not** for distribution —
> every build gets a different signature, so users cannot upgrade in place. For
> anything you distribute, use a persistent keystore (below).

---

## Route 2 — EAS Build

```bash
npm i -g eas-cli
eas login
eas build:configure          # writes the project id into app.config.ts extra
eas build --platform android --profile preview
```

`preview` produces an **APK**; `production` produces an **AAB** for the Play
Store. EAS manages the keystore for you (`eas credentials` to inspect or supply
your own).

Set the client env vars as EAS secrets so they are compiled in:

```bash
eas secret:create --name EXPO_PUBLIC_SUPABASE_URL --value https://xxx.supabase.co
eas secret:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value eyJhbGci...
```

---

## Route 3 — Local Gradle

### One-time setup

1. Install **JDK 17** (not 21 — the Android Gradle Plugin expects 17).
2. Install Android Studio, then in SDK Manager add:
   - Android SDK Platform **36**
   - Android SDK Build-Tools **36.0.0**
   - Android SDK Command-line Tools
   - NDK **27.1.12297006**
3. Export the environment:

```bash
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin
export JAVA_HOME=/path/to/jdk-17
```

### Generate the native project

```bash
npx expo prebuild --platform android --clean
```

This creates `android/` from `app.config.ts` — permissions, notification
channel, deep-link scheme, SDK versions, everything. It is generated output and
is gitignored; re-run it after changing `app.config.ts` or adding a native
dependency.

### Debug APK (fastest, no signing)

```bash
npm run apk:debug
# android/app/build/outputs/apk/debug/app-debug.apk
```

### Release APK

Create a keystore once and keep it safe — losing it means you can never update
an installed app:

```bash
keytool -genkeypair -v -storetype PKCS12 \
  -keystore glpcare-release.keystore \
  -alias glpcare -keyalg RSA -keysize 2048 -validity 10000
```

Move it to `android/app/`, then add to `android/gradle.properties`:

```properties
GLPCARE_UPLOAD_STORE_FILE=glpcare-release.keystore
GLPCARE_UPLOAD_KEY_ALIAS=glpcare
GLPCARE_UPLOAD_STORE_PASSWORD=<your password>
GLPCARE_UPLOAD_KEY_PASSWORD=<your password>
```

Wire it into `android/app/build.gradle`:

```gradle
signingConfigs {
    release {
        if (project.hasProperty('GLPCARE_UPLOAD_STORE_FILE')) {
            storeFile file(GLPCARE_UPLOAD_STORE_FILE)
            storePassword GLPCARE_UPLOAD_STORE_PASSWORD
            keyAlias GLPCARE_UPLOAD_KEY_ALIAS
            keyPassword GLPCARE_UPLOAD_KEY_PASSWORD
        }
    }
}
buildTypes {
    release {
        signingConfig signingConfigs.release   // was signingConfigs.debug
        ...
    }
}
```

Build:

```bash
npm run apk:release
# android/app/build/outputs/apk/release/app-release.apk
```

Play Store bundle instead:

```bash
npm run aab:release
# android/app/build/outputs/bundle/release/app-release.aab
```

---

## Installing on a phone

```bash
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

Or copy the APK across and tap it. On Android 8+ you will be asked to allow
installation from that source once.

---

## Smaller APKs

`app.config.ts` targets a universal APK, which is simplest to share. To split by
ABI (roughly halves the download), add to `android/app/build.gradle`:

```gradle
splits {
    abi {
        enable true
        reset()
        include 'armeabi-v7a', 'arm64-v8a', 'x86_64'
        universalApk false
    }
}
```

---

## iOS

```bash
npx expo prebuild --platform ios
npx expo run:ios                     # simulator
eas build --platform ios --profile production   # signed, for TestFlight
```

The iOS permission strings are already declared in `app.config.ts`. You need an
Apple Developer account for a device build.

---

## Troubleshooting

**`SDK location not found`** — `ANDROID_HOME` is not set, or
`android/local.properties` is missing `sdk.dir=/path/to/Sdk`.

**`Unsupported class file major version`** — you are on JDK 21. Switch to 17.

**`Execution failed for task ':app:mergeReleaseResources'`** — stale build:
`cd android && ./gradlew clean` then rebuild.

**Build succeeds, app crashes on launch** — see the section below; this bit us
for real and the cause was not the build.

**Reminders do not fire on Xiaomi/Oppo/Vivo** — these ship aggressive battery
managers. The user has to allow autostart and disable battery optimisation for
the app; there is no programmatic way around it on those OEM skins.

---

## The app installs but will not open

The icon appears, you tap it, the splash flashes and you are back on the home
screen. Nothing is shown, and nothing obviously failed.

### What causes it

Almost always a **throw during module evaluation**. When the bundle is loaded,
every module in the import graph is evaluated top to bottom before React mounts
anything. A module that calls into a native module at that point — not inside a
function, but at the top level of the file — will throw if that native module is
missing or if its JavaScript and native halves are version-mismatched.

That throw happens before React exists, so `ErrorBoundary` cannot catch it and
there is no screen to render an error onto. The process simply dies.

Nothing defers this for you. Verify it for your own config:

```bash
node -e "
const {getDefaultConfig}=require('expo/metro-config');
const c=getDefaultConfig(process.cwd());
c.transformer.getTransformOptions(['index.js'],{dev:false,hot:false},()=>[])
 .then(o=>console.log(JSON.stringify(o)));"
# -> {"transform":{"experimentalImportSupport":true,"inlineRequires":false}}
```

`inlineRequires: false` means every import in the graph is evaluated eagerly
when the bundle loads — a top-level import of a broken native module is enough
to kill the app, whether or not anything ever renders the component using it.

Two real instances in this app:

- `expo-audio` patches `AudioModule.AudioPlayer.prototype` while its module is
  evaluated. The chat screen imported it, the first tab imported the chat
  screen, so a version-mismatched `expo-audio` took the entire app down at
  launch. It is now loaded through a guarded `require` in `VoiceInputButton`,
  so a failure costs the microphone button and nothing else.
- `Linking.createURL('/')` was called at module scope in `RootNavigator` to
  build the deep-link prefixes. It *throws* when it cannot read the
  expo-constants manifest. The prefixes are now resolved on first render, with
  a fallback to the declared `glpcare://` scheme.

`npm test` now guards both: `src/app/__tests__/moduleEval.test.ts` imports every
file in `src/` and fails if any of them throws, and `mount.test.tsx` renders the
real root. Neither existed when this shipped, which is why it reached a phone.

### Getting the actual reason off the phone

The app no longer fails silently — `index.js` catches a module-evaluation throw
and renders `StartupFailure`, which prints the message and stack on a dark
screen. **A photo of that screen is usually the whole diagnosis.**

If it dies before even that, capture the native log:

```bash
adb logcat -c                                  # clear
# now launch the app on the phone, let it crash
adb logcat -d > crash.txt                      # dump
```

Then look for the cause:

```bash
grep -iE "FATAL|AndroidRuntime|ReactNative|glpcare" crash.txt | head -50
```

No cable? On the phone: enable Developer options, turn on **Wireless debugging**,
then `adb pair <host>:<port>` and `adb connect <host>:<port>` from a machine on
the same Wi-Fi. Failing that, an app such as *Logcat Reader* (needs no root for
its own process on many OEM builds) can export the log to a file you can send.

### Ruling out the boring causes first

```bash
# 1. Does the installed APK match the source you think it does?
adb shell dumpsys package in.glpcare.companion | grep -E "versionName|firstInstall"

# 2. Did a previous install with a different signing key leave residue?
adb uninstall in.glpcare.companion && adb install -r path/to/app-release.apk

# 3. Are any packages off the SDK's expected versions?
node -e "
const b=require('./node_modules/expo/bundledNativeModules.json');
const p=require('./package.json'), s=require('semver');
for (const n of Object.keys(p.dependencies)) {
  const w=b[n]; if(!w) continue;
  const h=require('./node_modules/'+n+'/package.json').version;
  if(!s.satisfies(h,w)) console.log('DRIFT', n, h, '!=', w);
}"
```

That last one is worth running whenever anything is added. A minor-version drift
in an Expo module means it was built for a different SDK, and the native half is
what breaks — quietly, and only in a real build.
