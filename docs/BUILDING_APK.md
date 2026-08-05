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

**Build succeeds, app crashes on launch** — usually a Metro/native mismatch after
adding a dependency. Re-run `npx expo prebuild --clean` and rebuild.

**Reminders do not fire on Xiaomi/Oppo/Vivo** — these ship aggressive battery
managers. The user has to allow autostart and disable battery optimisation for
the app; there is no programmatic way around it on those OEM skins.
